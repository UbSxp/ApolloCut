/**
 * @file Fila de trabalhos persistente (IndexedDB).
 * Estados: queued | running | paused | completed | failed | cancelled
 * Retomada ao abrir o app, limite de paralelismo por recurso, progresso real.
 */

const DB_NAME = 'ApolloCutQueue';
const DB_VERSION = 1;
const STORE_JOBS = 'jobs';
const STORE_LEDGER = 'ledger';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        const store = db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LEDGER)) {
        const ledger = db.createObjectStore(STORE_LEDGER, { keyPath: 'id', autoIncrement: true });
        ledger.createIndex('date', 'date', { unique: false });
        ledger.createIndex('provider', 'provider', { unique: false });
        ledger.createIndex('unit', 'unit', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/**
 * @typedef {Object} Job
 * @property {string} id - UUID
 * @property {string} type - Tipo do job: 'analyze' | 'transcribe' | 'translate' | 'tts' | 'reframe' | 'export' | 'publish' | 'generate-image' | 'generate-video' | 'video-to-video'
 * @property {string} status - 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
 * @property {Object} input - Entrada serializável do job
 * @property {Object} [output] - Resultado (quando completed)
 * @property {string} [error] - Mensagem de erro (quando failed)
 * @property {number} progress - 0 a 100
 * @property {string} stage - Etapa atual (ex.: 'extracting-audio', 'transcribing', 'rendering')
 * @property {string} message - Mensagem amigável para UI
 * @property {number} createdAt - timestamp
 * @property {number} [startedAt]
 * @property {number} [finishedAt]
 * @property {string} [provider] - Nome do provedor usado
 * @property {Object} [costEstimated] - { amount: number, currency: 'BRL', details: string }
 * @property {Object} [costActual] - { amount: number, currency: 'BRL' }
 * @property {Object} [resourceLimits] - { gpu: boolean, cpu: number, network: boolean }
 * @property {number} [retryCount]
 * @property {string} [parentJobId] - Para jobs filhos
 */

/**
 * Gera UUID simples.
 * @returns {string}
 */
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Adiciona job à fila.
 * @param {Omit<Job, 'id'|'createdAt'|'progress'|'status'>} jobData
 * @returns {Promise<string>} jobId
 */
async function enqueueJob(jobData) {
  const db = await openDB();
  const job = {
    ...jobData,
    id: generateId(),
    status: 'queued',
    progress: 0,
    stage: 'queued',
    message: 'Na fila',
    createdAt: Date.now(),
    retryCount: 0,
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readwrite');
    tx.objectStore(STORE_JOBS).add(job);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return job.id;
}

/**
 * Atualiza campos de um job.
 * @param {string} jobId
 * @param {Partial<Job>} updates
 * @returns {Promise<void>}
 */
async function updateJob(jobId, updates) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readwrite');
    const store = tx.objectStore(STORE_JOBS);
    const getReq = store.get(jobId);
    getReq.onsuccess = () => {
      const job = getReq.result;
      if (!job) return reject(new Error(`Job ${jobId} não encontrado`));
      Object.assign(job, updates);
      store.put(job);
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Obtém job por ID.
 * @param {string} jobId
 * @returns {Promise<Job|null>}
 */
async function getJob(jobId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readonly');
    const req = tx.objectStore(STORE_JOBS).get(jobId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lista jobs com filtros opcionais.
 * @param {Object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.type]
 * @param {number} [filters.limit=100]
 * @returns {Promise<Job[]>}
 */
async function listJobs(filters = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readonly');
    const store = tx.objectStore(STORE_JOBS);
    const index = filters.status ? store.index('status') : filters.type ? store.index('type') : null;
    const source = index || store;
    const req = source.openCursor();
    const results = [];
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const job = cursor.value;
        const matchStatus = !filters.status || job.status === filters.status;
        const matchType = !filters.type || job.type === filters.type;
        if (matchStatus && matchType) results.push(job);
        if (results.length < (filters.limit || 100)) cursor.continue();
      } else {
        // Ordena por createdAt desc
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove jobs antigos (completed/failed/cancelled) acima de um limite de idade.
 * @param {number} maxAgeMs - Idade máxima em ms (padrão 30 dias)
 * @param {number} maxCount - Máximo de jobs a manter (padrão 500)
 * @returns {Promise<number>} Quantidade removida
 */
async function pruneJobs(maxAgeMs = 30 * 24 * 60 * 60 * 1000, maxCount = 500) {
  const db = await openDB();
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readwrite');
    const store = tx.objectStore(STORE_JOBS);
    const index = store.index('createdAt');
    const req = index.openCursor(IDBKeyRange.upperBound(cutoff));
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const job = cursor.value;
        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => {
      // Segunda passagem: se ainda excede maxCount, remove os mais antigos concluídos
      if (removed < maxCount) return;
      const tx2 = db.transaction(STORE_JOBS, 'readwrite');
      const store2 = tx2.objectStore(STORE_JOBS);
      const index2 = store2.index('createdAt');
      const req2 = index2.openCursor();
      let count = 0;
      req2.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && count < removed - maxCount + 100) {
          const job = cursor.value;
          if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            cursor.delete();
            count++;
          }
          cursor.continue();
        }
      };
      tx2.oncomplete = resolve;
    };
  });
  return removed;
}

/**
 * Conta jobs por status.
 * @returns {Promise<Object<string, number>>}
 */
async function countJobsByStatus() {
  const jobs = await listJobs({ limit: 10000 });
  const counts = { queued: 0, running: 0, paused: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const job of jobs) counts[job.status]++;
  return counts;
}

/**
 * Worker pool com limite de paralelismo por recurso.
 */
class JobWorkerPool {
  /**
   * @param {Object} options
   * @param {number} options.maxConcurrent - Máximo total simultâneo
   * @param {Object} options.resourceLimits - { gpu: number, cpu: number, network: number }
   */
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 2;
    this.resourceLimits = options.resourceLimits || { gpu: 1, cpu: 2, network: 2 };
    this.running = new Map(); // jobId -> { job, abortController, resourceUsage }
    this.queueCheckInterval = null;
    this.onJobUpdate = null; // callback(job)
  }

  /**
   * Inicia o loop de verificação da fila.
   * @param {(job: Job) => Promise<void>} executeFn - Função que executa o job
   */
  start(executeFn) {
    if (this.queueCheckInterval) return;
    this.executeFn = executeFn;
    this.queueCheckInterval = setInterval(() => this.checkQueue(), 1000);
    this.checkQueue();
  }

  stop() {
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval);
      this.queueCheckInterval = null;
    }
  }

  /**
   * Verifica se pode iniciar novo job baseado nos limites de recurso.
   * @param {Job} job
   * @returns {boolean}
   */
  canStart(job) {
    if (this.running.size >= this.maxConcurrent) return false;
    const limits = job.resourceLimits || {};
    let gpuUsed = 0, cpuUsed = 0, netUsed = 0;
    for (const [, r] of this.running) {
      const u = r.resourceUsage || {};
      if (u.gpu) gpuUsed++;
      cpuUsed += u.cpu || 1;
      if (u.network) netUsed++;
    }
    if (limits.gpu && gpuUsed >= this.resourceLimits.gpu) return false;
    if ((limits.cpu || 1) + cpuUsed > this.resourceLimits.cpu) return false;
    if (limits.network && netUsed >= this.resourceLimits.network) return false;
    return true;
  }

  async checkQueue() {
    const jobs = await listJobs({ status: 'queued', limit: 50 });
    for (const job of jobs) {
      if (this.canStart(job)) {
        this.runJob(job);
      }
    }
  }

  async runJob(job) {
    const abortController = new AbortController();
    const resourceUsage = job.resourceLimits || { cpu: 1 };
    this.running.set(job.id, { job, abortController, resourceUsage });
    await updateJob(job.id, { status: 'running', startedAt: Date.now(), stage: 'starting', message: 'Iniciando...', progress: 0 });
    this.notify(job.id);

    try {
      const result = await this.executeFn(job, {
        signal: abortController.signal,
        onProgress: (p) => this.handleProgress(job.id, p),
      });
      await updateJob(job.id, {
        status: 'completed',
        finishedAt: Date.now(),
        progress: 100,
        stage: 'completed',
        message: 'Concluído',
        output: result.data,
        costActual: result.costActual ? { amount: result.costActual, currency: 'BRL' } : undefined,
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Cancelled') {
        await updateJob(job.id, { status: 'cancelled', finishedAt: Date.now(), message: 'Cancelado' });
      } else {
        const retryCount = (job.retryCount || 0) + 1;
        if (retryCount <= 2 && !err.message.includes('validation')) {
          await updateJob(job.id, { status: 'queued', retryCount, message: `Tentativa ${retryCount}/2`, progress: 0, stage: 'retry' });
        } else {
          await updateJob(job.id, { status: 'failed', finishedAt: Date.now(), error: err.message, message: `Falha: ${err.message}` });
        }
      }
    } finally {
      this.running.delete(job.id);
      this.notify(job.id);
      this.checkQueue(); // Tenta iniciar próximo
    }
  }

  handleProgress(jobId, { stage, progress, message }) {
    updateJob(jobId, { stage, progress: Math.round(progress * 100), message });
    this.notify(jobId);
  }

  notify(jobId) {
    if (this.onJobUpdate) {
      getJob(jobId).then(job => job && this.onJobUpdate(job));
    }
  }

  /**
   * Cancela job em execução ou na fila.
   * @param {string} jobId
   */
  async cancelJob(jobId) {
    const running = this.running.get(jobId);
    if (running) {
      running.abortController.abort();
      return;
    }
    const job = await getJob(jobId);
    if (job && job.status === 'queued') {
      await updateJob(jobId, { status: 'cancelled', finishedAt: Date.now(), message: 'Cancelado na fila' });
    }
  }

  /**
   * Pausa job na fila (não afeta os já rodando).
   * @param {string} jobId
   */
  async pauseJob(jobId) {
    const job = await getJob(jobId);
    if (job && job.status === 'queued') {
      await updateJob(jobId, { status: 'paused', message: 'Pausado' });
    }
  }

  /**
   * Retoma job pausado.
   * @param {string} jobId
   */
  async resumeJob(jobId) {
    const job = await getJob(jobId);
    if (job && job.status === 'paused') {
      await updateJob(jobId, { status: 'queued', message: 'Na fila' });
      this.checkQueue();
    }
  }
}

export {
  openDB,
  enqueueJob,
  updateJob,
  getJob,
  listJobs,
  pruneJobs,
  countJobsByStatus,
  JobWorkerPool,
  generateId,
};