/**
 * @file Compositor de Thumbnails Offline + ImageGenProvider (Item 7 + 9 — Categoria A/B).
 * Compositor local para capas/thumbnails + integração com ImageGenProvider (fake/real).
 * Templates por tipo de conteúdo, edição com imagem de referência, bulk-generate.
 */

import { getProviderFor } from '../providers/index.js';
import { enqueueJob, updateJob } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração de Thumbnails
   --------------------------------------------------------------- */
const THUMB_CONFIG = {
  // Dimensões padrão (YouTube Shorts, TikTok, Reels)
  dimensions: {
    default: { width: 1280, height: 720 },    // 16:9
    short: { width: 1080, height: 1920 },     // 9:16
    square: { width: 1080, height: 1080 },    // 1:1
  },
  // Templates de thumbnail
  templates: {
    podcast: {
      name: 'Podcast / Entrevista',
      ratio: '16:9',
      layout: 'split',           // convidado + host
      textPosition: 'bottom',
      backgroundStyle: 'gradient',
      accentColor: '#c9a45c',
    },
    gameplay: {
      name: 'Gameplay',
      ratio: '16:9',
      layout: 'gameplay',        // jogo + facecam
      textPosition: 'top',
      backgroundStyle: 'screenshot',
      accentColor: '#a84e2c',
    },
    tutorial: {
      name: 'Tutorial / Aula',
      ratio: '16:9',
      layout: 'screen+presenter', // tela + apresentador
      textPosition: 'side',
      backgroundStyle: 'solid',
      accentColor: '#17130f',
    },
    vlog: {
      name: 'Vlog / Cotidiano',
      ratio: '9:16',
      layout: 'portrait',        // pessoa centralizada
      textPosition: 'bottom',
      backgroundStyle: 'blur',
      accentColor: '#c9a45c',
    },
    shorts: {
      name: 'Shorts / Reels / TikTok',
      ratio: '9:16',
      layout: 'dynamic',         // texto grande + elemento visual
      textPosition: 'center',
      backgroundStyle: 'gradient',
      accentColor: '#a84e2c',
    },
  },
  // Configuração de fonte/texto
  text: {
    titleFont: { family: 'Cinzel', weight: 700, size: 0.08 },      // % da altura
    subtitleFont: { family: 'Manrope', weight: 600, size: 0.045 },
    maxTitleLines: 2,
    maxSubtitleLines: 3,
    padding: 0.05, // % da largura
  },
};

/* ---------------------------------------------------------------
   Compositor Offline (Canvas 2D)
   --------------------------------------------------------------- */

/**
 * Gera thumbnail offline a partir de frame de vídeo + template.
 * @param {HTMLVideoElement|HTMLCanvasElement|ImageBitmap} source
 * @param {Object} options
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function composeThumbnail(source, options = {}) {
  const {
    templateKey = 'shorts',
    title = '',
    subtitle = '',
    ratio = '9:16',
    accentColor,
    logoDataURL,
    progressCallback,
  } = options;

  const template = THUMB_CONFIG.templates[templateKey] || THUMB_CONFIG.templates.shorts;
  const dims = THUMB_CONFIG.dimensions[ratio] || THUMB_CONFIG.dimensions.short;

  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');

  // 1. Fundo
  await drawBackground(ctx, source, template, dims, progressCallback);

  // 2. Overlay de gradiente/escurecimento para legibilidade do texto
  drawTextOverlay(ctx, dims, template);

  // 3. Título e subtítulo
  drawText(ctx, title, subtitle, dims, template, accentColor);

  // 4. Logo (se houver)
  if (logoDataURL) {
    await drawLogo(ctx, logoDataURL, dims);
  }

  // 5. Elementos decorativos (linhas, formas, badge)
  drawDecorations(ctx, dims, template, accentColor);

  if (progressCallback) progressCallback({ stage: 'done', progress: 1, message: 'Thumbnail pronto' });
  return canvas;
}

/**
 * Desenha fundo do thumbnail.
 */
async function drawBackground(ctx, source, template, dims, progressCallback) {
  const { width, height } = dims;

  if (progressCallback) progressCallback({ stage: 'background', progress: 0.2, message: 'Desenhando fundo...' });

  if (source instanceof HTMLVideoElement) {
    // Extrai frame do vídeo (meio ou tempo especificado)
    const video = source;
    const frameTime = template.layout === 'gameplay' ? video.duration * 0.3 : video.duration * 0.5;
    video.currentTime = frameTime;
    await new Promise(r => video.onseeked = r);
    ctx.drawImage(video, 0, 0, width, height);
  } else if (source instanceof HTMLCanvasElement || source instanceof ImageBitmap) {
    ctx.drawImage(source, 0, 0, width, height);
  } else {
    // Fallback: gradiente
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Aplica estilo de fundo do template
  switch (template.backgroundStyle) {
    case 'blur':
      // Aplica blur no fundo (via filter)
      ctx.filter = 'blur(8px)';
      ctx.drawImage(ctx.canvas, 0, 0, width, height);
      ctx.filter = 'none';
      break;
    case 'gradient':
      // Overlay gradiente sutil
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      break;
    case 'solid':
    default:
      // Mantém frame original
      break;
  }
}

function drawTextOverlay(ctx, dims, template) {
  const { width, height } = dims;
  // Área de texto semi-transparente
  const textAreaHeight = height * (template.textPosition === 'center' ? 0.5 : 0.4);
  const y = template.textPosition === 'top' ? 0 : height - textAreaHeight;

  const grad = ctx.createLinearGradient(0, y, 0, y + textAreaHeight);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, width, textAreaHeight);
}

function drawText(ctx, title, subtitle, dims, template, accentColor) {
  const { width, height } = dims;
  const padding = width * THUMB_CONFIG.text.padding;

  let y = template.textPosition === 'top'
    ? height * 0.15
    : template.textPosition === 'center'
      ? height * 0.4
      : height * 0.65;

  const accent = accentColor || template.accentColor;

  // Título
  if (title) {
    ctx.font = `${THUMB_CONFIG.text.titleFont.weight} ${Math.round(height * THUMB_CONFIG.text.titleFont.size)}px ${THUMB_CONFIG.text.titleFont.family}`;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapText(ctx, title, width - padding * 2, THUMB_CONFIG.text.maxTitleLines);
    for (const line of lines) {
      ctx.strokeText(line, width / 2, y);
      ctx.fillText(line, width / 2, y);
      y += Math.round(height * THUMB_CONFIG.text.titleFont.size) * 1.2;
    }
  }

  // Subtítulo
  if (subtitle) {
    y += height * 0.02;
    ctx.font = `${THUMB_CONFIG.text.subtitleFont.weight} ${Math.round(height * THUMB_CONFIG.text.subtitleFont.size)}px ${THUMB_CONFIG.text.subtitleFont.family}`;
    ctx.fillStyle = accent;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;

    const lines = wrapText(ctx, subtitle, width - padding * 2, THUMB_CONFIG.text.maxSubtitleLines);
    for (const line of lines) {
      ctx.strokeText(line, width / 2, y);
      ctx.fillText(line, width / 2, y);
      y += Math.round(height * THUMB_CONFIG.text.subtitleFont.size) * 1.3;
    }
  }
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && lines.length < maxLines - 1) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines.slice(0, maxLines);
}

async function drawLogo(ctx, logoDataURL, dims) {
  const img = new Image();
  img.src = logoDataURL;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  const logoSize = Math.min(dims.width, dims.height) * 0.12;
  const x = dims.width - logoSize - dims.width * 0.03;
  const y = dims.height * 0.03;
  ctx.drawImage(img, x, y, logoSize, logoSize);
}

function drawDecorations(ctx, dims, template, accentColor) {
  const { width, height } = dims;
  const accent = accentColor || template.accentColor;

  // Linha decorativa lateral
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(width * 0.03, height * 0.2);
  ctx.lineTo(width * 0.03, height * 0.8);
  ctx.stroke();

  // Badge de plataforma (opcional)
  ctx.fillStyle = accent;
  ctx.font = '600 14px Manrope';
  ctx.fillText('APOLLOCUT', width * 0.05, height * 0.95);
}

/* ---------------------------------------------------------------
   ImageGenProvider Integration (Item 9 — Categoria B)
   --------------------------------------------------------------- */

/**
 * Gera thumbnail via IA (ImageGenProvider) + compõe com template.
 * @param {Object} options
 * @returns {Promise<{canvas: HTMLCanvasElement, prompt: string}>}
 */
export async function generateAIThumbnail(options = {}) {
  const {
    prompt,
    templateKey = 'shorts',
    ratio = '9:16',
    title = '',
    subtitle = '',
    referenceImage, // ImageData/HTMLCanvasElement para img2img
    signal,
    onProgress,
  } = options;

  const template = THUMB_CONFIG.templates[templateKey] || THUMB_CONFIG.templates.shorts;
  const dims = THUMB_CONFIG.dimensions[ratio] || THUMB_CONFIG.dimensions.short;

  if (onProgress) onProgress({ stage: 'ai-generation', progress: 0.1, message: 'Gerando imagem via IA...' });

  const provider = await getProviderFor('image-gen');
  let aiImage;

  if (!provider) {
    // Fallback: usa compositor offline com frame de vídeo
    const canvas = await composeThumbnail(null, { templateKey, title, subtitle, ratio, accentColor: template.accentColor });
    return { canvas, prompt: '(offline fallback)' };
  }

  try {
    const result = await provider.execute(
      {
        prompt,
        negativePrompt: options.negativePrompt,
        width: dims.width,
        height: dims.height,
        steps: options.steps || 20,
        guidanceScale: options.guidanceScale || 7.5,
        model: options.model,
        referenceImage: referenceImage ? await canvasToArrayBuffer(referenceImage) : undefined,
      },
      { signal, onProgress: p => onProgress?.({ ...p, progress: 0.1 + 0.7 * (p.progress || 0) }) }
    );

    if (!result.ok) throw new Error(result.error);

    // Converte ArrayBuffer para ImageBitmap
    const blob = new Blob([result.data.image], { type: result.data.mimeType || 'image/png' });
    const aiBitmap = await createImageBitmap(blob);

    if (onProgress) onProgress({ stage: 'compose', progress: 0.8, message: 'Compondo thumbnail final...' });

    // Compõe thumbnail final com a imagem IA + template
    const canvas = await composeThumbnail(aiBitmap, { templateKey, title, subtitle, ratio, accentColor: template.accentColor });

    return { canvas, prompt, aiImage: aiBitmap };
  } catch (e) {
    console.warn('[Thumbnails] IA falhou, usando fallback offline:', e.message);
    const canvas = await composeThumbnail(null, { templateKey, title, subtitle, ratio, accentColor: template.accentColor });
    return { canvas, prompt: `(fallback: ${e.message})` };
  }
}

async function canvasToArrayBuffer(canvas) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  return blob.arrayBuffer();
}

/* ---------------------------------------------------------------
   Bulk Generation (integração com editor)
   --------------------------------------------------------------- */

/**
 * Gera thumbnails para múltiplos cortes aprovados.
 * @param {Array} cutIds
 * @param {Object} editorState
 * @param {Object} options
 * @returns {Promise<Array<{cutId, canvas, dataURL}>>}
 */
export async function bulkGenerateThumbnails(cutIds, editorState, options = {}) {
  const { useAI = false, templateKey, ratio, onProgress } = options;
  const cuts = editorState.project.cuts.filter(c => cutIds.has(c.id) && c.approved);
  const results = [];

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    const templateKey = options.templateKey || editorState.project.template;
    const ratio = options.ratio || editorState.project.settings.ratio;

    let canvas;
    if (useAI) {
      const prompt = `Thumbnail for ${editorState.project.template}: ${cut.topicKeywords.join(', ')}, ${cut.reason}`;
      const result = await generateAIThumbnail({
        prompt,
        templateKey,
        ratio,
        title: `Corte ${cut.index}`,
        subtitle: cut.topicKeywords.slice(0, 3).join(', '),
        signal: options.signal,
        onProgress: p => options.onProgress?.({ ...p, cutIndex: i, total: cuts.length }),
      });
      canvas = result.canvas;
    } else {
      // Usa frame do corte
      const video = document.createElement('video');
      video.src = editorState.project.video._blobURL || URL.createObjectURL(editorState.project.video._file);
      video.preload = 'metadata';
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });
      video.currentTime = (cut.customStart || cut.start) + cut.duration / 2;
      await new Promise(r => video.onseeked = r);

      canvas = await composeThumbnail(video, { templateKey, ratio, title: `Corte ${cut.index}` });
    }

    const dataURL = canvas.toDataURL('image/jpeg', 0.9);
    results.push({ cutId: cut.id, canvas, dataURL });

    if (onProgress) onProgress({ stage: 'thumbnails', progress: (i + 1) / cuts.length, message: `Thumb ${i + 1}/${cuts.length}` });
  }
  return results;
}

/**
 * Baixa thumbnail como arquivo.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 */
export function downloadThumbnail(canvas, filename = 'thumbnail.jpg') {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}

/* ---------------------------------------------------------------
   Job de fila para geração em lote
   --------------------------------------------------------------- */

export async function enqueueBatchThumbnailJob(cutIds, options = {}) {
  const jobId = await enqueueJob({
    type: 'batch-thumbnail',
    input: { cutIds, options },
    resourceLimits: { cpu: 1, gpu: true, network: true },
    costEstimated: { amount: 0, currency: 'BRL', details: options.useAI ? 'Geração IA (custo por imagem)' : 'Offline: custo zero' },
  });
  return jobId;
}

export async function batchThumbnailWorker(job, options) {
  const { signal, onProgress } = options;
  const { cutIds, options: thumbOpts } = job.input;
  const editorState = job.input.editorState;
  if (!editorState) throw new Error('editorState não fornecido');

  const results = await bulkGenerateThumbnails(cutIds, editorState, { ...thumbOpts, signal, onProgress });
  return { ok: true, data: { generated: results.length } };
}

export { THUMB_CONFIG };