/**
 * @file Editor de Cortes, Edição em Massa, Brand Kit e Templates (Item 5 — Categoria A).
 * Integração com motor de cortes e reenquadramento.
 * Persistência de projetos (Item 13) via IndexedDB.
 */

import { reframeVideo, renderReframedVideo } from './reframe-engine.js';
import { analyzeVideoForCuts } from './cut-engine.js';
import { enqueueJob, updateJob, listJobs, getJob } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração do Editor
   --------------------------------------------------------------- */
const EDITOR_CONFIG = {
  // Timeline
  timeline: {
    zoomLevels: [0.5, 1, 2, 5, 10, 30], // segundos por pixel
    defaultZoom: 2,
    snapThreshold: 0.1, // segundos para snap em bordas de sentença
  },
  // Brand Kit
  brandKit: {
    maxLogoSize: 512 * 1024, // 512KB
    allowedLogoTypes: ['image/svg+xml', 'image/png', 'image/webp'],
    maxWatermarkOpacity: 0.8,
    defaultWatermarkPosition: 'top-right',
  },
  // Templates
  templates: {
    podcast: {
      name: 'Podcast / Entrevista',
      ratio: '9:16',
      captionStyle: 'marmore',
      reframeLayout: 'group',
      watermark: true,
      introOutro: false,
    },
    gameplay: {
      name: 'Gameplay',
      ratio: '9:16',
      captionStyle: 'ditirambo',
      reframeLayout: 'gameplay',
      watermark: true,
      introOutro: true,
    },
    tutorial: {
      name: 'Tutorial / Aula',
      ratio: '9:16',
      captionStyle: 'estrofe',
      reframeLayout: 'screenshare',
      watermark: true,
      introOutro: false,
    },
    vlog: {
      name: 'Vlog / Cotidiano',
      ratio: '9:16',
      captionStyle: 'ode',
      reframeLayout: 'solo',
      watermark: true,
      introOutro: false,
    },
    shorts: {
      name: 'Shorts Rápido',
      ratio: '9:16',
      captionStyle: 'marmore',
      reframeLayout: 'solo',
      watermark: false,
      introOutro: false,
    },
  },
  // Projetos
  projects: {
    dbName: 'ApolloCutProjects',
    version: 1,
    storeName: 'projects',
  },
};

/* ---------------------------------------------------------------
   Estado do Editor (singleton)
   --------------------------------------------------------------- */
let editorState = {
  project: null, // { id, name, createdAt, updatedAt, videoFile, cuts: [], brandKit, template }
  timeline: {
    zoom: EDITOR_CONFIG.timeline.defaultZoom,
    playhead: 0,
    selection: null, // { cutId, edge: 'start'|'end' }
    multiSelect: new Set(),
  },
  reframeKeyframes: null, // resultado do reenquadramento
  unsavedChanges: false,
};

let projectDBPromise = null;

function openProjectDB() {
  if (projectDBPromise) return projectDBPromise;
  projectDBPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(EDITOR_CONFIG.projects.dbName, EDITOR_CONFIG.projects.version);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(EDITOR_CONFIG.projects.storeName)) {
        const store = db.createObjectStore(EDITOR_CONFIG.projects.storeName, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return projectDBPromise;
}

/* ---------------------------------------------------------------
   Projetos (Item 13)
   --------------------------------------------------------------- */

/**
 * Cria novo projeto a partir de arquivo de vídeo.
 * @param {File} videoFile
 * @param {string} name
 * @returns {Promise<Object>} projeto
 */
export async function createProject(videoFile, name) {
  const id = `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const videoURL = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = videoURL;
  video.preload = 'metadata';
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });
  URL.revokeObjectURL(videoURL);

  const project = {
    id,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    video: {
      name: videoFile.name,
      size: videoFile.size,
      type: videoFile.type,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      // Blob não serializa bem no IndexedDB — guardamos referência temporária
      // Em produção, usar FileSystemAccess API ou armazenar arquivo
    },
    cuts: [],
    brandKit: {
      logo: null, // dataURL
      colors: { primary: '#c9a45c', secondary: '#17130f', background: '#f4eee2' },
      fonts: { title: 'Cinzel', body: 'Manrope', caption: 'Cormorant Garamond' },
      captionStyle: 'marmore',
      watermark: { enabled: true, opacity: 0.6, position: 'top-right' },
      introOutro: { enabled: false, introURL: null, outroURL: null },
    },
    template: 'podcast',
    settings: {
      ratio: '9:16',
      targetDuration: { min: 15, max: 60, ideal: 30 },
      autoReframe: true,
    },
  };

  editorState.project = project;
  editorState.unsavedChanges = true;
  return project;
}

/**
 * Salva projeto no IndexedDB.
 * @returns {Promise<void>}
 */
export async function saveProject() {
  if (!editorState.project) return;
  const db = await openProjectDB();
  const project = { ...editorState.project, updatedAt: Date.now() };
  // Remove video blob para serialização (recria ao carregar)
  const { video, ...rest } = project;
  const toSave = { ...rest, video: { ...video } }; // video sem blob
  await new Promise((resolve, reject) => {
    const tx = db.transaction(EDITOR_CONFIG.projects.storeName, 'readwrite');
    tx.objectStore(EDITOR_CONFIG.projects.storeName).put(toSave);
    tx.oncomplete = () => { editorState.project = project; editorState.unsavedChanges = false; resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Carrega projeto do IndexedDB.
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export async function loadProject(projectId) {
  const db = await openProjectDB();
  const project = await new Promise((resolve, reject) => {
    const tx = db.transaction(EDITOR_CONFIG.projects.storeName, 'readonly');
    const req = tx.objectStore(EDITOR_CONFIG.projects.storeName).get(projectId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!project) throw new Error('Projeto não encontrado');
  editorState.project = { ...project, video: { ...project.video } };
  editorState.unsavedChanges = false;
  return editorState.project;
}

/**
 * Lista todos os projetos.
 * @returns {Promise<Array>}
 */
export async function listProjects() {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EDITOR_CONFIG.projects.storeName, 'readonly');
    const req = tx.objectStore(EDITOR_CONFIG.projects.storeName).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

/**
 * Deleta projeto.
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function deleteProject(projectId) {
  const db = await openProjectDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(EDITOR_CONFIG.projects.storeName, 'readwrite');
    tx.objectStore(EDITOR_CONFIG.projects.storeName).delete(projectId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  if (editorState.project?.id === projectId) {
    editorState.project = null;
  }
}

/* ---------------------------------------------------------------
   Cortes (integração com cut-engine)
   --------------------------------------------------------------- */

/**
 * Analisa vídeo do projeto atual e popula cortes sugeridos.
 * @param {Object} options - { ratio, maxCuts, useLLM, onProgress }
 * @returns {Promise<Array>} cortes sugeridos
 */
export async function analyzeProjectCuts(options = {}) {
  if (!editorState.project) throw new Error('Nenhum projeto aberto');

  // Recria video element
  const videoEl = document.createElement('video');
  videoEl.src = editorState.project.video._blobURL || URL.createObjectURL(editorState.project.video._file);
  videoEl.preload = 'metadata';
  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = resolve;
    videoEl.onerror = reject;
  });

  const cuts = await analyzeVideoForCuts(videoEl, {
    ratio: editorState.project.settings.ratio,
    maxCuts: options.maxCuts || 30,
    useLLM: options.useLLM || false,
    onProgress: options.onProgress,
    signal: options.signal,
  });

  // Converte para formato do projeto
  editorState.project.cuts = cuts.map((c, i) => ({
    id: c.id,
    index: i + 1,
    start: c.start,
    end: c.end,
    duration: c.duration,
    score: c.score,
    reason: c.reason,
    thumbnail: c.thumbnail,
    sentences: c.sentences,
    topicKeywords: c.topicKeywords,
    // Estado de edição
    approved: false,
    reframeLayout: null, // será preenchido pelo reenquadramento
    reframeKeyframes: null,
    captionStyle: editorState.project.brandKit.captionStyle,
    watermark: editorState.project.brandKit.watermark.enabled,
    // Overrides manuais
    customStart: null,
    customEnd: null,
    customCaptionStyle: null,
    customReframeLayout: null,
    customWatermark: null,
  }));

  editorState.unsavedChanges = true;
  await saveProject();
  return editorState.project.cuts;
}

/**
 * Aprova/rejeita corte.
 * @param {string} cutId
 * @param {boolean} approved
 */
export function setCutApproved(cutId, approved) {
  const cut = editorState.project.cuts.find(c => c.id === cutId);
  if (cut) {
    cut.approved = approved;
    editorState.unsavedChanges = true;
  }
}

/**
 * Ajusta início/fim do corte (edição por quadro).
 * @param {string} cutId
 * @param {number} start
 * @param {number} end
 */
export function setCutTiming(cutId, start, end) {
  const cut = editorState.project.cuts.find(c => c.id === cutId);
  if (cut && start >= 0 && end <= editorState.project.video.duration && end > start + 0.5) {
    cut.customStart = start;
    cut.customEnd = end;
    cut.duration = end - start;
    editorState.unsavedChanges = true;
  }
}

/**
 * Divide corte em dois no tempo especificado.
 * @param {string} cutId
 * @param {number} splitTime - tempo relativo ao início do corte original
 * @returns {string} ID do novo corte
 */
export function splitCut(cutId, splitTime) {
  const idx = editorState.project.cuts.findIndex(c => c.id === cutId);
  if (idx === -1) return null;
  const cut = editorState.project.cuts[idx];
  const absSplit = (cut.customStart || cut.start) + splitTime;
  if (absSplit <= (cut.customStart || cut.start) + 1 || absSplit >= (cut.customEnd || cut.end) - 1) return null;

  const newCut = {
    ...cut,
    id: `cut-${Date.now().toString(36)}`,
    start: absSplit,
    end: cut.customEnd || cut.end,
    customStart: absSplit,
    customEnd: null,
    duration: (cut.customEnd || cut.end) - absSplit,
    approved: false,
    index: cut.index + 0.5, // será reordenado
  };
  cut.end = absSplit;
  cut.customEnd = absSplit;
  cut.duration = absSplit - (cut.customStart || cut.start);

  editorState.project.cuts.splice(idx + 1, 0, newCut);
  reindexCuts();
  editorState.unsavedChanges = true;
  return newCut.id;
}

/**
 * Junta dois cortes adjacentes.
 * @param {string} cutId1
 * @param {string} cutId2
 * @returns {boolean}
 */
export function joinCuts(cutId1, cutId2) {
  const idx1 = editorState.project.cuts.findIndex(c => c.id === cutId1);
  const idx2 = editorState.project.cuts.findIndex(c => c.id === cutId2);
  if (idx1 === -1 || idx2 === -1 || Math.abs(idx1 - idx2) !== 1) return false;

  const [first, second] = idx1 < idx2 ? [editorState.project.cuts[idx1], editorState.project.cuts[idx2]] : [editorState.project.cuts[idx2], editorState.project.cuts[idx1]];
  first.end = second.customEnd || second.end;
  first.customEnd = null;
  first.duration = first.end - (first.customStart || first.start);
  editorState.project.cuts.splice(editorState.project.cuts.indexOf(second), 1);
  reindexCuts();
  editorState.unsavedChanges = true;
  return true;
}

function reindexCuts() {
  editorState.project.cuts.sort((a, b) => (a.customStart || a.start) - (b.customStart || b.start));
  editorState.project.cuts.forEach((c, i) => { c.index = i + 1; });
}

/* ---------------------------------------------------------------
   Edição em Massa
   --------------------------------------------------------------- */

/**
 * Aplica ação a múltiplos cortes selecionados.
 * @param {Set<string>} cutIds
 * @param {Object} action - { type: 'approve'|'reject'|'captionStyle'|'watermark'|'reframeLayout'|'delete', value?: any }
 */
export function bulkEditCuts(cutIds, action) {
  const cuts = editorState.project.cuts.filter(c => cutIds.has(c.id));
  for (const cut of cuts) {
    switch (action.type) {
      case 'approve': cut.approved = action.value; break;
      case 'reject': cut.approved = false; break;
      case 'captionStyle': cut.customCaptionStyle = action.value; break;
      case 'watermark': cut.customWatermark = action.value; break;
      case 'reframeLayout': cut.customReframeLayout = action.value; break;
      case 'delete':
        editorState.project.cuts = editorState.project.cuts.filter(c => !cutIds.has(c.id));
        break;
    }
  }
  reindexCuts();
  editorState.unsavedChanges = true;
}

/* ---------------------------------------------------------------
   Brand Kit
   --------------------------------------------------------------- */

/**
 * Atualiza Brand Kit do projeto.
 * @param {Object} updates
 */
export function updateBrandKit(updates) {
  editorState.project.brandKit = { ...editorState.project.brandKit, ...updates };
  // Propaga para cortes sem override
  for (const cut of editorState.project.cuts) {
    if (!cut.customCaptionStyle) cut.captionStyle = editorState.project.brandKit.captionStyle;
    if (cut.customWatermark === undefined) cut.watermark = editorState.project.brandKit.watermark.enabled;
  }
  editorState.unsavedChanges = true;
}

/**
 * Define logo do Brand Kit (dataURL).
 * @param {string} dataURL
 */
export async function setBrandLogo(dataURL) {
  if (dataURL.length > EDITOR_CONFIG.brandKit.maxLogoSize) {
    throw new Error(`Logo excede ${EDITOR_CONFIG.brandKit.maxLogoSize / 1024}KB`);
  }
  editorState.project.brandKit.logo = dataURL;
  editorState.unsavedChanges = true;
}

/* ---------------------------------------------------------------
   Templates
   --------------------------------------------------------------- */

/**
 * Aplica template ao projeto (sobrescreve configurações).
 * @param {string} templateKey
 */
export function applyTemplate(templateKey) {
  const tmpl = EDITOR_CONFIG.templates[templateKey];
  if (!tmpl) throw new Error(`Template ${templateKey} não existe`);
  editorState.project.template = templateKey;
  editorState.project.settings.ratio = tmpl.ratio;
  editorState.project.brandKit.captionStyle = tmpl.captionStyle;
  // Define layout de reenquadramento padrão para novos cortes
  for (const cut of editorState.project.cuts) {
    if (!cut.customReframeLayout) cut.reframeLayout = tmpl.reframeLayout;
    if (!cut.customCaptionStyle) cut.captionStyle = tmpl.captionStyle;
    if (cut.customWatermark === undefined) cut.watermark = tmpl.watermark;
  }
  editorState.unsavedChanges = true;
}

/**
 * Lista templates disponíveis.
 * @returns {Array}
 */
export function listTemplates() {
  return Object.entries(EDITOR_CONFIG.templates).map(([key, t]) => ({ key, ...t }));
}

/* ---------------------------------------------------------------
   Reenquadramento por corte (integração com reframe-engine)
   --------------------------------------------------------------- */

/**
 * Calcula reenquadramento para um corte específico.
 * @param {string} cutId
 * @param {Object} options
 * @returns {Promise<Object>} keyframes de reenquadramento
 */
export async function computeCutReframe(cutId, options = {}) {
  const cut = editorState.project.cuts.find(c => c.id === cutId);
  if (!cut) throw new Error('Corte não encontrado');

  const video = document.createElement('video');
  video.src = editorState.project.video._blobURL || URL.createObjectURL(editorState.project.video._file);
  video.preload = 'metadata';
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  // Busca layout do corte (custom > template > auto)
  const layout = cut.customReframeLayout || editorState.project.template && EDITOR_CONFIG.templates[editorState.project.template]?.reframeLayout || 'auto';

  const result = await reframeVideo(video, {
    platform: 'default',
    signal: options.signal,
    onProgress: options.onProgress,
    // Força layout específico se não for 'auto'
    ...(layout !== 'auto' ? { forceLayout: layout } : {}),
  });

  cut.reframeKeyframes = result.keyframes;
  cut.reframeLayout = result.layout;
  editorState.unsavedChanges = true;
  await saveProject();
  return result;
}

/**
 * Renderiza corte reenquadrado para exportação.
 * @param {string} cutId
 * @param {Object} options
 * @returns {Promise<Blob>}
 */
export async function renderCutReframed(cutId, options = {}) {
  const cut = editorState.project.cuts.find(c => c.id === cutId);
  if (!cut || !cut.reframeKeyframes) throw new Error('Reenquadramento não calculado');

  const video = document.createElement('video');
  video.src = editorState.project.video._blobURL || URL.createObjectURL(editorState.project.video._file);
  video.preload = 'metadata';
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  const blob = await renderReframedVideo(video, cut.reframeKeyframes, {
    signal: options.signal,
    onProgress: options.onProgress,
  });
  return blob;
}

/* ---------------------------------------------------------------
   Timeline State (UI)
   --------------------------------------------------------------- */

export function getTimelineState() {
  return { ...editorState.timeline };
}

export function setTimelineZoom(zoom) {
  editorState.timeline.zoom = Math.max(...EDITOR_CONFIG.timeline.zoomLevels.filter(z => z <= zoom), EDITOR_CONFIG.timeline.zoomLevels[0]);
}

export function setPlayhead(time) {
  editorState.timeline.playhead = Math.max(0, Math.min(editorState.project?.video?.duration || 0, time));
}

export function setSelection(cutId, edge) {
  editorState.timeline.selection = { cutId, edge };
}

export function toggleMultiSelect(cutId) {
  if (editorState.timeline.multiSelect.has(cutId)) {
    editorState.timeline.multiSelect.delete(cutId);
  } else {
    editorState.timeline.multiSelect.add(cutId);
  }
}

export function clearMultiSelect() {
  editorState.timeline.multiSelect.clear();
}

export function getMultiSelect() {
  return new Set(editorState.timeline.multiSelect);
}

/* ---------------------------------------------------------------
   Estado global
   --------------------------------------------------------------- */

export function getEditorState() {
  return {
    project: editorState.project ? { ...editorState.project } : null,
    timeline: { ...editorState.timeline },
    unsavedChanges: editorState.unsavedChanges,
    templates: listTemplates(),
  };
}

export function markSaved() {
  editorState.unsavedChanges = false;
}

export function hasUnsavedChanges() {
  return editorState.unsavedChanges;
}

/* ---------------------------------------------------------------
   Jobs de fila para editor (exportação em lote, etc.)
   --------------------------------------------------------------- */

export async function enqueueBatchExportJob(cutIds, options = {}) {
  const jobId = await enqueueJob({
    type: 'batch-export',
    input: { cutIds, options },
    resourceLimits: { cpu: 1, gpu: true, network: false },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Exportação local em lote: custo zero' },
  });
  return jobId;
}

export async function batchExportWorker(job, options) {
  const { signal, onProgress } = options;
  const { cutIds, options: exportOpts } = job.input;
  const project = editorState.project; // assume projeto carregado

  const results = [];
  for (let i = 0; i < cutIds.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const cutId = cutIds[i];
    try {
      const blob = await renderCutReframed(cutId, { signal, onProgress: p => onProgress?.({ ...p, progress: (i + p.progress) / cutIds.length }) });
      results.push({ cutId, ok: true, blob });
    } catch (e) {
      results.push({ cutId, ok: false, error: e.message });
    }
  }
  return { ok: true, data: results };
}

export { EDITOR_CONFIG };