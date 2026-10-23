/**
 * @file Orçamento de gastos (ledger local).
 * Registro de cada operação paga: data, provedor, unidade, custo estimado/real.
 * Teto diário/mensal configurável, confirmação explícita acima de valor.
 * Mostra custo estimado antes de iniciar (em BRL, sem cobrança real).
 */

const DB_NAME = 'ApolloCutBudget';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_CONFIG = 'config';

let dbPromise = null;

function openBudgetDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('provider', 'provider', { unique: false });
        store.createIndex('unit', 'unit', { unique: false });
        store.createIndex('jobId', 'jobId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/**
 * @typedef {Object} LedgerEntry
 * @property {number} [id] - Auto-increment
 * @property {number} date - Timestamp da operação
 * @property {string} provider - Nome do provedor (ex.: 'openai-gpt4', 'elevenlabs-tts')
 * @property {string} operation - Tipo de operação (ex.: 'transcribe', 'generate-image', 'tts')
 * @property {string} unit - Unidade (token, second, minute, image, character, post)
 * @property {number} quantity - Quantidade usada
 * @property {number} costEstimated - Custo estimado em BRL
 * @property {number} [costActual] - Custo real informado pelo provedor
 * @property {string} currency - 'BRL'
 * @property {string} [jobId] - ID do job relacionado
 * @property {Object} [metadata] - Detalhes extras (modelo, qualidade, etc.)
 */

/**
 * @typedef {Object} BudgetConfig
 * @property {string} key - 'budget-config'
 * @property {number} dailyLimitBRL - Teto diário em BRL
 * @property {number} monthlyLimitBRL - Teto mensal em BRL
 * @property {number} confirmationThresholdBRL - Pede confirmação acima deste valor
 * @property {boolean} enabled - Se o controle de orçamento está ativo
 * @property {number} updatedAt - Timestamp da última alteração
 */

const DEFAULT_CONFIG = {
  key: 'budget-config',
  dailyLimitBRL: 50.00,
  monthlyLimitBRL: 500.00,
  confirmationThresholdBRL: 5.00,
  enabled: true,
  updatedAt: Date.now(),
};

/**
 * Obtém configuração atual.
 * @returns {Promise<BudgetConfig>}
 */
async function getBudgetConfig() {
  const db = await openBudgetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const req = tx.objectStore(STORE_CONFIG).get('budget-config');
    req.onsuccess = () => resolve(req.result || DEFAULT_CONFIG);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Atualiza configuração.
 * @param {Partial<BudgetConfig>} updates
 * @returns {Promise<BudgetConfig>}
 */
async function setBudgetConfig(updates) {
  const db = await openBudgetDB();
  const current = await getBudgetConfig();
  const next = { ...current, ...updates, updatedAt: Date.now() };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readwrite');
    tx.objectStore(STORE_CONFIG).put(next);
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error);
  });
  return next;
}

/**
 * Registra uma entrada no ledger.
 * @param {Omit<LedgerEntry, 'id'>} entry
 * @returns {Promise<number>} ID da entrada
 */
async function recordEntry(entry) {
  const db = await openBudgetDB();
  const fullEntry = {
    ...entry,
    date: entry.date || Date.now(),
    currency: entry.currency || 'BRL',
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const req = tx.objectStore(STORE_ENTRIES).add(fullEntry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Atualiza custo real de uma entrada (quando provedor informa após a execução).
 * @param {number} entryId
 * @param {number} costActual
 * @returns {Promise<void>}
 */
async function updateEntryActualCost(entryId, costActual) {
  const db = await openBudgetDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_ENTRIES);
    const req = store.get(entryId);
    req.onsuccess = () => {
      const entry = req.result;
      if (!entry) return reject(new Error(`Entrada ${entryId} não encontrada`));
      entry.costActual = costActual;
      store.put(entry);
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lista entradas com filtros.
 * @param {Object} [filters]
 * @param {number} [filters.startDate]
 * @param {number} [filters.endDate]
 * @param {string} [filters.provider]
 * @param {number} [filters.limit=200]
 * @returns {Promise<LedgerEntry[]>}
 */
async function listEntries(filters = {}) {
  const db = await openBudgetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const store = tx.objectStore(STORE_ENTRIES);
    const index = filters.provider ? store.index('provider') : store.index('date');
    const range = filters.startDate || filters.endDate
      ? IDBKeyRange.bound(filters.startDate || 0, filters.endDate || Infinity)
      : null;
    const req = index.openCursor(range, 'prev');
    const results = [];
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < (filters.limit || 200)) {
        const entry = cursor.value;
        const matchProvider = !filters.provider || entry.provider === filters.provider;
        if (matchProvider) results.push(entry);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Calcula totais por período.
 * @param {number} startDate
 * @param {number} endDate
 * @returns {Promise<{estimated: number, actual: number, count: number}>}
 */
async function getTotals(startDate, endDate) {
  const entries = await listEntries({ startDate, endDate, limit: 10000 });
  let estimated = 0, actual = 0;
  for (const e of entries) {
    estimated += e.costEstimated || 0;
    actual += e.costActual || 0;
  }
  return { estimated, actual, count: entries.length };
}

/**
 * Obtém gasto do dia atual.
 * @returns {Promise<{estimated: number, actual: number}>}
 */
async function getTodaySpending() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return getTotals(start, end);
}

/**
 * Obtém gasto do mês atual.
 * @returns {Promise<{estimated: number, actual: number}>}
 */
async function getMonthSpending() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return getTotals(start, end);
}

/**
 * Verifica se uma operação estimada excede limites.
 * @param {number} estimatedCostBRL
 * @returns {Promise<{allowed: boolean, reason?: string, requiresConfirmation: boolean}>}
 */
async function checkBudget(estimatedCostBRL) {
  const config = await getBudgetConfig();
  if (!config.enabled) return { allowed: true, requiresConfirmation: false };

  const [today, month] = await Promise.all([getTodaySpending(), getMonthSpending()]);
  const projectedDaily = today.estimated + estimatedCostBRL;
  const projectedMonthly = month.estimated + estimatedCostBRL;

  if (projectedDaily > config.dailyLimitBRL) {
    return { allowed: false, reason: `Excederia o limite diário de R$ ${config.dailyLimitBRL.toFixed(2)} (projetado: R$ ${projectedDaily.toFixed(2)})`, requiresConfirmation: false };
  }
  if (projectedMonthly > config.monthlyLimitBRL) {
    return { allowed: false, reason: `Excederia o limite mensal de R$ ${config.monthlyLimitBRL.toFixed(2)} (projetado: R$ ${projectedMonthly.toFixed(2)})`, requiresConfirmation: false };
  }

  const requiresConfirmation = estimatedCostBRL >= config.confirmationThresholdBRL;
  return { allowed: true, requiresConfirmation };
}

/**
 * Formata valor em BRL para exibição.
 * @param {number} value
 * @returns {string}
 */
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Gera relatório de gastos por provedor/operação.
 * @param {number} [startDate]
 * @param {number} [endDate]
 * @returns {Promise<Object>}
 */
async function getSpendingReport(startDate, endDate) {
  const entries = await listEntries({ startDate, endDate, limit: 5000 });
  const byProvider = {};
  const byOperation = {};
  const byUnit = {};
  let totalEstimated = 0, totalActual = 0;

  for (const e of entries) {
    totalEstimated += e.costEstimated || 0;
    totalActual += e.costActual || 0;

    byProvider[e.provider] = (byProvider[e.provider] || 0) + (e.costActual || e.costEstimated || 0);
    byOperation[e.operation] = (byOperation[e.operation] || 0) + (e.costActual || e.costEstimated || 0);
    byUnit[e.unit] = (byUnit[e.unit] || 0) + (e.costActual || e.costEstimated || 0);
  }

  return {
    period: { start: startDate, end: endDate },
    totals: { estimated: totalEstimated, actual: totalActual, count: entries.length },
    byProvider,
    byOperation,
    byUnit,
    entries: entries.slice(0, 50), // Últimas 50 para detalhe
  };
}

/**
 * Limpa entradas antigas (padrão: > 90 dias).
 * @param {number} maxAgeMs
 * @returns {Promise<number>} Quantidade removida
 */
async function pruneEntries(maxAgeMs = 90 * 24 * 60 * 60 * 1000) {
  const db = await openBudgetDB();
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const index = tx.objectStore(STORE_ENTRIES).index('date');
    const req = index.openCursor(IDBKeyRange.upperBound(cutoff));
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        removed++;
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
  return removed;
}

export {
  openBudgetDB,
  getBudgetConfig,
  setBudgetConfig,
  recordEntry,
  updateEntryActualCost,
  listEntries,
  getTotals,
  getTodaySpending,
  getMonthSpending,
  checkBudget,
  formatBRL,
  getSpendingReport,
  pruneEntries,
  DEFAULT_CONFIG,
};