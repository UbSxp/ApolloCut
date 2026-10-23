/**
 * @file Legendas Avançadas: Tradução + Export ASS (Item 6 — Categoria A/B).
 * TranslationProvider (fake + real), exportação ASS com estilos, posicionamento, karaoke.
 * Integração com editor: bulk-edit de estilo, tradução em massa.
 */

import { getProviderFor } from '../providers/index.js';
import { enqueueJob, updateJob } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração de legendas avançadas
   --------------------------------------------------------------- */
const CAPTION_CONFIG = {
  // Estilos de legenda (compatível com editor/brandkit)
  styles: {
    ode: { name: 'Ode', fontFamily: 'Cinzel', fontWeight: 700, uppercase: true, color: '#fff9ec', bgColor: '#c9a45c', activeColor: '#17130f', outline: true },
    estrofe: { name: 'Estrofe', fontFamily: 'Cormorant Garamond', fontWeight: 600, uppercase: false, color: '#fff8e9', bgColor: null, activeColor: '#ffffff', underline: true },
    marmore: { name: 'Mármore', fontFamily: 'Manrope', fontWeight: 800, uppercase: true, color: '#17130f', bgColor: '#f4eee2', activeColor: '#c9a45c', outline: true },
    ditirambo: { name: 'Ditirambo', fontFamily: 'Manrope', fontWeight: 800, uppercase: true, color: '#fff4e3', bgColor: '#a84e2c', activeColor: '#f4eee2', outline: true },
  },
  // Formatos de exportação
  formats: {
    srt: { name: 'SubRip (.srt)', extension: 'srt', mimeType: 'text/plain' },
    ass: { name: 'Advanced SubStation Alpha (.ass)', extension: 'ass', mimeType: 'text/plain' },
    vtt: { name: 'WebVTT (.vtt)', extension: 'vtt', mimeType: 'text/vtt' },
  },
  // Tradução
  translation: {
    defaultTargetLang: 'en',
    supportedLangs: ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh'],
    batchSize: 50, // caracteres por request (para APIs com limite)
  },
};

/* ---------------------------------------------------------------
   Utilitários de tempo
   --------------------------------------------------------------- */
function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100); // centissegundos
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatVttTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/* ---------------------------------------------------------------
   Exportação SRT
   --------------------------------------------------------------- */

/**
 * Exporta grupos de legenda para SRT.
 * @param {Array} groups - [{words: [{text, start, end}], start, end}]
 * @returns {string}
 */
export function exportSRT(groups) {
  let srt = '';
  let index = 1;
  for (const group of groups) {
    const text = group.words.map(w => w.text).join(' ');
    srt += `${index}\n${formatSrtTime(group.start)} --> ${formatSrtTime(group.end)}\n${text}\n\n`;
    index++;
  }
  return srt.trim() + '\n';
}

/* ---------------------------------------------------------------
   Exportação ASS (Advanced SubStation Alpha)
   --------------------------------------------------------------- */

/**
 * Gera cabeçalho ASS com estilos definidos.
 * @param {Object} styleConfig - Estilo do Brand Kit
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @returns {string}
 */
function generateASSHeader(styleConfig, videoWidth, videoHeight) {
  const style = CAPTION_CONFIG.styles[styleConfig.captionStyle] || CAPTION_CONFIG.styles.marmore;
  const fontSize = Math.round(Math.min(videoWidth, videoHeight) * 0.05);
  const outline = style.outline ? 3 : 0;
  const shadow = style.outline ? 2 : 0;

  // Converte cores para formato ASS (BBGGRR&H)
  function toASSColor(hex) {
    const c = hex.replace('#', '');
    return `&H${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}`;
  }

  const primaryColor = toASSColor(style.color);
  const backColor = style.bgColor ? toASSColor(style.bgColor) : '&H00000000';
  const outlineColor = toASSColor(style.activeColor);
  const shadowColor = '&H00000000';

  return `[Script Info]
Title: ApolloCut Legendas
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${fontSize},${primaryColor},${backColor},${outlineColor},${shadowColor},${style.fontWeight >= 700 ? -1 : 0},0,${style.underline ? -1 : 0},0,100,100,0,0,1,${outline},${shadow},2,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

/**
 * Exporta grupos de legenda para ASS.
 * @param {Array} groups - [{words: [{text, start, end}], start, end, style}]
 * @param {Object} videoMeta - {width, height, captionStyle}
 * @returns {string}
 */
export function exportASS(groups, videoMeta) {
  const { width = 1080, height = 1920, captionStyle = 'marmore' } = videoMeta || {};
  let ass = generateASSHeader({ captionStyle }, width, height);
  let layer = 0;

  for (const group of groups) {
    const start = formatAssTime(group.start);
    const end = formatAssTime(group.end);
    const styleName = 'Default';

    if (group.words && group.words.length > 1) {
      // Karaoke estilo: cada palavra com tempo individual
      let text = '';
      for (let i = 0; i < group.words.length; i++) {
        const w = group.words[i];
        const dur = Math.round((w.end - w.start) * 100); // centissegundos
        text += `{\\k${dur}}${w.text}`;
        if (i < group.words.length - 1) text += ' ';
      }
      ass += `Dialogue: ${layer},${start},${end},${styleName},,0,0,0,,${text}\n`;
    } else {
      // Linha simples
      const text = group.words.map(w => w.text).join(' ');
      ass += `Dialogue: ${layer},${start},${end},${styleName},,0,0,0,,${text}\n`;
    }
    layer++;
  }
  return ass;
}

/* ---------------------------------------------------------------
   Exportação VTT
   --------------------------------------------------------------- */

export function exportVTT(groups) {
  let vtt = 'WEBVTT\n\n';
  for (const group of groups) {
    const text = group.words.map(w => w.text).join(' ');
    vtt += `${formatVttTime(group.start)} --> ${formatVttTime(group.end)}\n${text}\n\n`;
  }
  return vtt;
}

/* ---------------------------------------------------------------
   Tradução de legendas
   --------------------------------------------------------------- */

/**
 * Traduz grupos de legenda para idioma alvo.
 * @param {Array} groups
 * @param {string} targetLang - 'en', 'es', etc.
 * @param {string} sourceLang - 'pt', 'en', etc.
 * @param {Object} options - { signal, onProgress, preserveTiming: true }
 * @returns {Promise<Array>} grupos traduzidos (mesmos tempos, texto traduzido)
 */
export async function translateCaptions(groups, targetLang, sourceLang = 'pt', options = {}) {
  const { signal, onProgress, preserveTiming = true } = options;
  const translator = await getProviderFor('translation');

  if (!translator) {
    // Fallback local: apenas simula tradução
    return groups.map(g => ({
      ...g,
      words: g.words.map(w => ({ ...w, text: `[${targetLang.toUpperCase()}] ${w.text}` })),
    }));
  }

  // Agrupa texto para tradução em lote (respeita batchSize)
  const allText = groups.map(g => g.words.map(w => w.text).join(' ')).join(' ||| ');
  const batchSize = CAPTION_CONFIG.translation.batchSize * 10; // aprox chars

  const translatedGroups = [];
  let charCount = 0;
  let currentBatch = [];
  let currentGroups = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const text = g.words.map(w => w.text).join(' ');
    if (charCount + text.length > batchSize && currentBatch.length > 0) {
      // Processa lote atual
      const translated = await translateBatch(currentBatch.join(' ||| '), targetLang, sourceLang, translator, signal, onProgress);
      const parts = translated.split(' ||| ');
      for (let j = 0; j < currentGroups.length; j++) {
        const words = currentGroups[j].words.map((w, k) => ({ ...w, text: parts[j]?.split(' ')[k] || w.text }));
        translatedGroups.push({ ...currentGroups[j], words });
      }
      currentBatch = [];
      currentGroups = [];
      charCount = 0;
    }
    currentBatch.push(text);
    currentGroups.push(g);
    charCount += text.length;
  }

  // Último lote
  if (currentBatch.length > 0) {
    const translated = await translateBatch(currentBatch.join(' ||| '), targetLang, sourceLang, translator, signal, onProgress);
    const parts = translated.split(' ||| ');
    for (let j = 0; j < currentGroups.length; j++) {
      const words = currentGroups[j].words.map((w, k) => ({ ...w, text: parts[j]?.split(' ')[k] || w.text }));
      translatedGroups.push({ ...currentGroups[j], words });
    }
  }

  return translatedGroups;
}

async function translateBatch(text, targetLang, sourceLang, translator, signal, onProgress) {
  if (onProgress) onProgress({ stage: 'translate', progress: 0.3, message: 'Traduzindo...' });
  const result = await translator.execute(
    { text, sourceLang, targetLang, preserveFormatting: true },
    { signal, onProgress: p => onProgress?.({ ...p, progress: 0.3 + 0.6 * (p.progress || 0) }) }
  );
  if (!result.ok) throw new Error(result.error);
  return result.data.text;
}

/* ---------------------------------------------------------------
   Edição em massa de legendas (integração com editor)
   --------------------------------------------------------------- */

/**
 * Aplica tradução a múltiplos cortes do projeto.
 * @param {Array} cutIds
 * @param {string} targetLang
 * @param {Object} editorState - estado do editor (editor.js)
 * @returns {Promise<void>}
 */
export async function bulkTranslateCuts(cutIds, targetLang, editorState) {
  const cuts = editorState.project.cuts.filter(c => cutIds.has(c.id));
  for (const cut of cuts) {
    if (cut.sentences) {
      const translated = await translateCaptions(cut.sentences, targetLang, editorState.project.settings.lang || 'pt');
      cut.sentences = translated;
      cut.translated = true;
      cut.translationLang = targetLang;
    }
  }
  editorState.unsavedChanges = true;
}

/**
 * Aplica estilo de legenda a múltiplos cortes.
 * @param {Array} cutIds
 * @param {string} styleKey
 * @param {Object} editorState
 */
export function bulkSetCaptionStyle(cutIds, styleKey, editorState) {
  if (!CAPTION_CONFIG.styles[styleKey]) throw new Error(`Estilo ${styleKey} não existe`);
  const cuts = editorState.project.cuts.filter(c => cutIds.has(c.id));
  for (const cut of cuts) {
    cut.customCaptionStyle = styleKey;
    cut.captionStyle = styleKey;
  }
  editorState.unsavedChanges = true;
}

/**
 * Exporta legendas de um corte no formato especificado.
 * @param {string} cutId
 * @param {string} format - 'srt' | 'ass' | 'vtt'
 * @param {Object} editorState
 * @returns {string}
 */
export function exportCutCaptions(cutId, format, editorState) {
  const cut = editorState.project.cuts.find(c => c.id === cutId);
  if (!cut || !cut.sentences) throw new Error('Corte sem legendas');

  const groups = cut.sentences;
  const videoMeta = {
    width: editorState.project.video.width,
    height: editorState.project.video.height,
    captionStyle: cut.customCaptionStyle || editorState.project.brandKit.captionStyle,
  };

  switch (format) {
    case 'srt': return exportSRT(groups);
    case 'ass': return exportASS(groups, videoMeta);
    case 'vtt': return exportVTT(groups);
    default: throw new Error(`Formato ${format} não suportado`);
  }
}

/**
 * Baixa arquivo de legenda.
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadCaptionFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------
   Job de fila para tradução em lote
   --------------------------------------------------------------- */

export async function enqueueBatchTranslateJob(cutIds, targetLang, options = {}) {
  const jobId = await enqueueJob({
    type: 'batch-translate',
    input: { cutIds, targetLang, options },
    resourceLimits: { cpu: 1, gpu: false, network: true },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Tradução via provedor configurado' },
  });
  return jobId;
}

export async function batchTranslateWorker(job, options) {
  const { signal, onProgress } = options;
  const { cutIds, targetLang, options: translateOpts } = job.input;
  // Assume editorState disponível globalmente ou passado via input
  // Em produção, carregar projeto do IndexedDB
  const editorState = job.input.editorState;
  if (!editorState) throw new Error('editorState não fornecido');

  await bulkTranslateCuts(cutIds, targetLang, editorState);
  return { ok: true, data: { translated: cutIds.length } };
}

export { CAPTION_CONFIG, formatSrtTime, formatAssTime, formatVttTime };