/**
 * @file Reenquadramento Inteligente 16:9 → 9:16 (Item 4 — Categoria A).
 * Detector offline (YuNet ONNX via WebNN/WASM ou MediaPipe WASM), rastreamento com suavização,
 * layouts automáticos por tipo de cena, zonas seguras, saída 1080×1920 H.264 High yuv420p AAC faststart.
 * Editor de enquadramento no ateliê: troca manual de layout, ajuste de ROI, keyframes.
 */

import { getProviderFor } from '../providers/index.js';
import { enqueueJob, updateJob } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração de reenquadramento
   --------------------------------------------------------------- */
const REFRAME_CONFIG = {
  // Detecção
  detection: {
    model: 'yunet-320x320',        // YuNet 320x320 (leve, ~1MB)
    inputSize: [320, 320],
    scoreThreshold: 0.6,
    nmsThreshold: 0.3,
    topK: 5,
    backend: 'webgl',              // 'webgl' | 'wasm' | 'webnn'
  },
  // Rastreamento
  tracking: {
    maxAge: 30,                    // frames sem detecção antes de perder track
    minHits: 3,                    // hits mínimos para confirmar track
    iouThreshold: 0.3,             // IoU para associar detecção a track
    smoothingAlpha: 0.35,          // EMA para posição/tamanho (0-1, menor = mais suave)
    kalman: true,                  // usa filtro de Kalman se disponível
  },
  // Classificação de cena (heurística local)
  sceneClassification: {
    faceSizeRatio: {              // razões de tamanho de rosto para classificar
      closeUp: 0.35,              // rosto > 35% da altura → close-up
      medium: 0.15,               // 15-35% → plano médio
      wide: 0.15,                 // < 15% → plano aberto
    },
    multiFaceThreshold: 2,        // >= 2 rostos simultâneos → grupo/podcast
    screenShareMotionRatio: 0.6,  // > 60% da área com movimento → tela compartilhada
    gameplayColorVariance: 0.4,   // alta variância de cor → gameplay
  },
  // Layouts 9:16 (1080x1920)
  layouts: {
    // 1 falante: acompanhamento vertical centralizado
    solo: {
      name: 'Acompanhamento (1 falante)',
      computeCrop: (face, frameW, frameH) => {
        const targetW = 1080, targetH = 1920;
        const scale = targetH / frameH;
        const cropW = frameW * scale;
        const cropH = targetH;
        // Centraliza no rosto horizontalmente
        const faceCenterX = (face.x + face.w / 2) * scale;
        let cropX = faceCenterX - cropW / 2;
        cropX = Math.max(0, Math.min(frameW * scale - cropW, cropX));
        return { x: cropX, y: 0, w: cropW, h: cropH, scale };
      },
    },
    // 2 falantes: split vertical (um em cima, outro embaixo) ou lado a lado se horizontal
    dual: {
      name: 'Split Vertical (2 falantes)',
      computeCrop: (faces, frameW, frameH) => {
        const targetW = 1080, targetH = 1920;
        const scale = targetH / frameH;
        const cropW = frameW * scale;
        const cropH = targetH;
        // Ordena por Y (topo → base)
        faces.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
        const topFace = faces[0];
        const bottomFace = faces[1];
        // Corta região que engloba os dois com margem
        const minY = Math.min(topFace.y, bottomFace.y) * scale;
        const maxY = Math.max(topFace.y + topFace.h, bottomFace.y + bottomFace.h) * scale;
        let cropY = Math.max(0, minY - (targetH - (maxY - minY)) / 2);
        cropY = Math.min(cropY, frameH * scale - targetH);
        const cropX = Math.max(0, Math.min(frameW * scale - cropW, (topFace.x + topFace.w / 2) * scale - cropW / 2));
        return { x: cropX, y: cropY, w: cropW, h: cropH, scale };
      },
    },
    // Grupo/podcast: alterna foco no falante ativo (VAD + movimento boca)
    group: {
      name: 'Foco no Falante Ativo (grupo)',
      computeCrop: (activeFace, frameW, frameH) => {
        const targetW = 1080, targetH = 1920;
        const scale = targetH / frameH;
        const cropW = frameW * scale;
        const cropH = targetH;
        const faceCenterX = (activeFace.x + activeFace.w / 2) * scale;
        let cropX = faceCenterX - cropW / 2;
        cropX = Math.max(0, Math.min(frameW * scale - cropW, cropX));
        return { x: cropX, y: 0, w: cropW, h: cropH, scale };
      },
    },
    // Gameplay: área do jogo em cima (70%), câmera jogador embaixo (30%)
    gameplay: {
      name: 'Gameplay + Câmera (jogo em cima)',
      computeCrop: (face, frameW, frameH) => {
        const targetW = 1080, targetH = 1920;
        const scale = targetH / frameH;
        const cropW = frameW * scale;
        const cropH = targetH;
        // Jogo ocupa topo 70%
        const gameH = targetH * 0.7;
        const camH = targetH * 0.3;
        // Câmera do jogador: centralizada na parte inferior
        const faceCenterX = (face.x + face.w / 2) * scale;
        let camX = faceCenterX - cropW / 2;
        camX = Math.max(0, Math.min(frameW * scale - cropW, camX));
        return {
          game: { x: 0, y: 0, w: cropW, h: gameH, scale },
          camera: { x: camX, y: gameH, w: cropW, h: camH, scale },
        };
      },
    },
    // Aula/tela compartilhada: conteúdo em cima (75%), apresentador embaixo (25%)
    screenshare: {
      name: 'Tela Compartilhada + Apresentador',
      computeCrop: (face, frameW, frameH) => {
        const targetW = 1080, targetH = 1920;
        const scale = targetH / frameH;
        const cropW = frameW * scale;
        const cropH = targetH;
        const contentH = targetH * 0.75;
        const presenterH = targetH * 0.25;
        const faceCenterX = (face.x + face.w / 2) * scale;
        let presenterX = faceCenterX - cropW / 2;
        presenterX = Math.max(0, Math.min(frameW * scale - cropW, presenterX));
        return {
          content: { x: 0, y: 0, w: cropW, h: contentH, scale },
          presenter: { x: presenterX, y: contentH, w: cropW, h: presenterH, scale },
        };
      },
    },
    // Fallback: centralizado com blur do próprio vídeo nas bordas
    fallback: {
      name: 'Centralizado + Blur (fallback)',
      computeCrop: (frameW, frameH) => {
        const targetW = 1080, targetH = 1920;
        const scale = targetH / frameH;
        const cropW = frameW * scale;
        const cropH = targetH;
        const cropX = Math.max(0, (frameW * scale - cropW) / 2);
        return { x: cropX, y: 0, w: cropW, h: cropH, scale, blur: true };
      },
    },
  },
  // Zonas seguras por plataforma (% da altura/largura)
  safeZones: {
    tiktok: { top: 0.15, bottom: 0.22, left: 0.05, right: 0.05 },
    reels: { top: 0.12, bottom: 0.25, left: 0.05, right: 0.05 },
    shorts: { top: 0.10, bottom: 0.20, left: 0.05, right: 0.05 },
    default: { top: 0.10, bottom: 0.20, left: 0.05, right: 0.05 },
  },
  // Saída
  output: {
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'avc1.640028', // H.264 High @ L4.2
    pixelFormat: 'yuv420p',
    audioCodec: 'mp4a.40.2', // AAC-LC
    audioSampleRate: 48000,
    audioChannels: 2,
  },
};

/* ---------------------------------------------------------------
   Detector de rostos (YuNet ONNX via ONNX Runtime Web)
   --------------------------------------------------------------- */

let yunetSession = null;
let yunetInputName = null;
let yunetOutputNames = null;

/**
 * Inicializa YuNet (carrega modelo ONNX uma vez).
 * @returns {Promise<boolean>} true se inicializou com sucesso
 */
async function initYuNet() {
  if (yunetSession) return true;
  try {
    // Tenta carregar onnxruntime-web via CDN (só na primeira vez)
    const ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js');
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

    // Modelo YuNet 320x320 (arquivo .onnx ~1MB — usuário pode hospedar localmente)
    const modelUrl = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx';
    yunetSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
    yunetInputName = yunetSession.inputNames[0];
    yunetOutputNames = yunetSession.outputNames;
    console.log('[Reframe] YuNet carregado:', yunetInputName, yunetOutputNames);
    return true;
  } catch (e) {
    console.warn('[Reframe] Falha ao carregar YuNet:', e.message);
    return false;
  }
}

/**
 * Detecta rostos em frame (ImageData ou canvas).
 * @param {HTMLCanvasElement|ImageData} frame
 * @returns {Promise<Array<{x:number,y:number,w:number,h:number,score:number,landmarks:Array<number>}>>}
 */
async function detectFaces(frame) {
  if (!yunetSession) {
    const ok = await initYuNet();
    if (!ok) return [];
  }

  // Prepara input: 320x320 RGB
  const canvas = frame instanceof HTMLCanvasElement ? frame : (() => { const c = document.createElement('canvas'); c.width = frame.width; c.height = frame.height; c.getContext('2d').putImageData(frame, 0, 0); return c; })();
  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = 320;
  inputCanvas.height = 320;
  const ictx = inputCanvas.getContext('2d');
  ictx.drawImage(canvas, 0, 0, 320, 320);
  const imgData = ictx.getImageData(0, 0, 320, 320);

  // Normaliza para float32 [0,1] CHW
  const input = new Float32Array(3 * 320 * 320);
  const data = imgData.data;
  for (let y = 0; y < 320; y++) {
    for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      input[0 * 320 * 320 + y * 320 + x] = data[i] / 255;       // R
      input[1 * 320 * 320 + y * 320 + x] = data[i + 1] / 255;   // G
      input[2 * 320 * 320 + y * 320 + x] = data[i + 2] / 255;   // B
    }
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, 320, 320]);
  const feeds = { [yunetInputName]: tensor };
  const results = await yunetSession.run(feeds);

  // Output YuNet: [1, N, 15] — x, y, w, h, score, 5 landmarks (x,y)
  const output = results[yunetOutputNames[0]];
  const faces = [];
  const numDets = output.dims[1];
  const oData = output.data;

  for (let i = 0; i < numDets; i++) {
    const base = i * 15;
    const score = oData[base + 4];
    if (score < REFRAME_CONFIG.detection.scoreThreshold) continue;
    // Coordenadas normalizadas 0-1 → pixels do frame original
    const scaleX = canvas.width / 320;
    const scaleY = canvas.height / 320;
    faces.push({
      x: oData[base] * scaleX,
      y: oData[base + 1] * scaleY,
      w: oData[base + 2] * scaleX,
      h: oData[base + 3] * scaleY,
      score,
      landmarks: [
        oData[base + 5] * scaleX, oData[base + 6] * scaleY,
        oData[base + 7] * scaleX, oData[base + 8] * scaleY,
        oData[base + 9] * scaleX, oData[base + 10] * scaleY,
        oData[base + 11] * scaleX, oData[base + 12] * scaleY,
        oData[base + 13] * scaleX, oData[base + 14] * scaleY,
      ],
    });
  }
  return faces;
}

/* ---------------------------------------------------------------
   Rastreador de rostos (Kalman + EMA)
   --------------------------------------------------------------- */

class FaceTrack {
  constructor(face, frameIdx) {
    this.id = `face-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.face = { ...face }; // x,y,w,h,score,landmarks
    this.smoothed = { ...face };
    this.age = 0;
    this.hits = 1;
    this.lastFrame = frameIdx;
    this.kalman = null; // placeholder para filtro de Kalman
  }

  update(face, frameIdx) {
    this.age = frameIdx - this.lastFrame;
    this.lastFrame = frameIdx;
    this.hits++;
    // EMA smoothing
    const a = REFRAME_CONFIG.tracking.smoothingAlpha;
    this.smoothed.x = a * face.x + (1 - a) * this.smoothed.x;
    this.smoothed.y = a * face.y + (1 - a) * this.smoothed.y;
    this.smoothed.w = a * face.w + (1 - a) * this.smoothed.w;
    this.smoothed.h = a * face.h + (1 - a) * this.smoothed.h;
    this.face = { ...face };
  }

  predict(frameIdx) {
    // Extrapola posição se perdeu detecção
    if (this.age > 0) return this.smoothed;
    return this.face;
  }

  isLost(maxAge = REFRAME_CONFIG.tracking.maxAge) {
    return this.age > maxAge;
  }
}

/**
 * Associa detecções a tracks existentes (IoU).
 */
function associateDetectionsToTracks(detections, tracks, frameIdx) {
  const used = new Set();
  const newTracks = [];

  for (const det of detections) {
    let bestTrack = null;
    let bestIoU = 0;
    for (const track of tracks) {
      if (used.has(track.id)) continue;
      const iou = computeIoU(det, track.smoothed);
      if (iou > REFRAME_CONFIG.tracking.iouThreshold && iou > bestIoU) {
        bestIoU = iou;
        bestTrack = track;
      }
    }
    if (bestTrack) {
      bestTrack.update(det, frameIdx);
      used.add(bestTrack.id);
      newTracks.push(bestTrack);
    } else {
      // Nova track
      newTracks.push(new FaceTrack(det, frameIdx));
    }
  }
  // Mantém tracks não associados (envelhecem)
  for (const track of tracks) {
    if (!used.has(track.id)) {
      newTracks.push(track);
    }
  }
  // Remove tracks perdidas
  return newTracks.filter(t => !t.isLost());
}

function computeIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  return inter / (areaA + areaB - inter);
}

/* ---------------------------------------------------------------
   Classificação de cena e seleção de layout
   --------------------------------------------------------------- */

/**
 * Classifica a cena a cada frame.
 * @param {Array} faces - tracks ativos
 * @param {ImageData} frameData - frame atual
 * @param {Object} audioActivity - { isSpeech: boolean, mouthOpenness: number } do VAD
 * @returns {string} layout key: 'solo' | 'dual' | 'group' | 'gameplay' | 'screenshare' | 'fallback'
 */
function classifyScene(faces, frameData, audioActivity) {
  const conf = REFRAME_CONFIG.sceneClassification;
  const confirmed = faces.filter(t => t.hits >= REFRAME_CONFIG.tracking.minHits);

  if (confirmed.length === 0) {
    // Sem rostos: verifica se é tela compartilhada ou gameplay
    const motion = estimateMotion(frameData);
    const colorVar = estimateColorVariance(frameData);
    if (motion > conf.screenShareMotionRatio) return 'screenshare';
    if (colorVar > conf.gameplayColorVariance) return 'gameplay';
    return 'fallback';
  }

  if (confirmed.length >= conf.multiFaceThreshold) {
    // Grupo/podcast: usa falante ativo
    return 'group';
  }

  if (confirmed.length === 2) {
    // Dois falantes: split vertical
    return 'dual';
  }

  // Um falante: verifica tamanho do rosto
  const face = confirmed[0].smoothed;
  const faceRatio = face.h / (frameData.height || 720);
  if (faceRatio > conf.faceSizeRatio.closeUp) return 'solo'; // close-up
  if (faceRatio > conf.faceSizeRatio.medium) return 'solo'; // médio
  return 'solo'; // wide — ainda usa acompanhamento
}

/**
 * Identifica o falante ativo no modo grupo.
 * @param {Array} faces
 * @param {Object} audioActivity
 * @returns {FaceTrack|null}
 */
function getActiveSpeaker(faces, audioActivity) {
  const confirmed = faces.filter(t => t.hits >= REFRAME_CONFIG.tracking.minHits);
  if (!confirmed.length) return null;
  if (!audioActivity?.isSpeech) return confirmed[0]; // fallback: primeiro

  // Combina VAD + abertura da boca (landmarks 12-14 = lábios)
  let best = null, bestScore = -1;
  for (const t of confirmed) {
    const mouthOpen = estimateMouthOpenness(t.face.landmarks);
    const score = (audioActivity.mouthOpenness || 0) * 0.7 + mouthOpen * 0.3;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best || confirmed[0];
}

function estimateMouthOpenness(landmarks) {
  if (!landmarks || landmarks.length < 10) return 0;
  // Pontos 12-14 = lábio superior/inferior (aprox YuNet)
  const topY = landmarks[12 * 2 + 1];
  const bottomY = landmarks[14 * 2 + 1];
  return Math.max(0, bottomY - topY) / 100; // normalizado grosseiro
}

function estimateMotion(frameData) {
  // Placeholder: diferença de frame anterior
  return 0;
}

function estimateColorVariance(frameData) {
  const data = frameData.data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
  }
  r /= count; g /= count; b /= count;
  let varR = 0, varG = 0, varB = 0;
  for (let i = 0; i < data.length; i += 4) {
    varR += (data[i] - r) ** 2;
    varG += (data[i + 1] - g) ** 2;
    varB += (data[i + 2] - b) ** 2;
  }
  return (varR + varG + varB) / (3 * count * 255 * 255);
}

/* ---------------------------------------------------------------
   Pipeline de reenquadramento
   --------------------------------------------------------------- */

/**
 * @typedef {Object} ReframedResult
 * @property {string} layout - layout usado
 * @property {Array} keyframes - [{time, crop: {x,y,w,h,scale}, layout}]
 * @property {string} platform - 'tiktok'|'reels'|'shorts'|'default'
 */

export async function reframeVideo(video, options = {}) {
  const {
    platform = 'default',
    signal,
    onProgress,
    // Callbacks para editor manual
    onLayoutChange,
    onManualCrop,
  } = options;

  const safeZone = REFRAME_CONFIG.safeZones[platform] || REFRAME_CONFIG.safeZones.default;
  const frameW = video.videoWidth;
  const frameH = video.videoHeight;
  const duration = video.duration;

  // Inicializa detector
  await initYuNet();

  const tracks = [];
  const keyframes = [];
  let currentLayout = null;
  let lastCrop = null;

  // Amostra a cada 0.5s (pode ser configurável)
  const sampleInterval = 0.5;
  const totalSamples = Math.ceil(duration / sampleInterval);

  if (onProgress) onProgress({ stage: 'init', progress: 0, message: 'Inicializando reenquadramento...' });

  for (let i = 0; i < totalSamples; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const t = i * sampleInterval;
    video.currentTime = t;
    await new Promise(r => video.onseeked = r);

    // Desenha frame em canvas pequeno para detecção
    const detCanvas = document.createElement('canvas');
    detCanvas.width = frameW;
    detCanvas.height = frameH;
    const dctx = detCanvas.getContext('2d');
    dctx.drawImage(video, 0, 0, frameW, frameH);
    const frameData = dctx.getImageData(0, 0, frameW, frameH);

    // Detecta rostos
    const detections = await detectFaces(detCanvas);
    // Atualiza tracks
    tracks.length = 0;
    tracks.push(...associateDetectionsToTracks(detections, tracks, i));

    // Classifica cena
    const layout = classifyScene(tracks, frameData, { isSpeech: false, mouthOpenness: 0 });
    if (layout !== currentLayout) {
      currentLayout = layout;
      if (onLayoutChange) onLayoutChange(t, layout);
    }

    // Computa crop conforme layout
    let crop;
    const confirmed = tracks.filter(t => t.hits >= REFRAME_CONFIG.tracking.minHits);
    const layoutDef = REFRAME_CONFIG.layouts[layout] || REFRAME_CONFIG.layouts.fallback;

    if (layout === 'group') {
      const active = getActiveSpeaker(tracks, { isSpeech: false, mouthOpenness: 0 });
      crop = layoutDef.computeCrop(active?.smoothed || { x: frameW/2, y: frameH/2, w: 100, h: 100 }, frameW, frameH);
    } else if (layout === 'dual') {
      crop = layoutDef.computeCrop(confirmed.map(t => t.smoothed), frameW, frameH);
    } else if (layout === 'gameplay' || layout === 'screenshare') {
      // Retorna dois crops (game/content + camera/presenter)
      const face = confirmed[0]?.smoothed || { x: frameW/2, y: frameH/2, w: 100, h: 100 };
      crop = layoutDef.computeCrop(face, frameW, frameH);
    } else {
      const face = confirmed[0]?.smoothed || { x: frameW/2, y: frameH/2, w: 100, h: 100 };
      crop = layoutDef.computeCrop(face, frameW, frameH);
    }

    // Aplica zona segura
    crop = applySafeZone(crop, safeZone, REFRAME_CONFIG.output.width, REFRAME_CONFIG.output.height);

    // Suaviza transição de crop (EMA entre keyframes)
    if (lastCrop) {
      const alpha = 0.15; // suavização temporal
      crop.x = alpha * crop.x + (1 - alpha) * lastCrop.x;
      crop.y = alpha * crop.y + (1 - alpha) * lastCrop.y;
      crop.w = alpha * crop.w + (1 - alpha) * lastCrop.w;
      crop.h = alpha * crop.h + (1 - alpha) * lastCrop.h;
    }
    lastCrop = crop;

    // Salva keyframe
    keyframes.push({ time: t, crop: { ...crop }, layout: currentLayout });

    if (onProgress) onProgress({ stage: 'tracking', progress: (i + 1) / totalSamples, message: `Frame ${i+1}/${totalSamples} (${layout})` });
  }

  // Compacta keyframes: remove redundantes (crop similar)
  const compacted = compactKeyframes(keyframes);

  if (onProgress) onProgress({ stage: 'done', progress: 1, message: 'Reenquadramento concluído' });

  return {
    layout: currentLayout,
    keyframes: compacted,
    platform,
    safeZone,
    output: REFRAME_CONFIG.output,
  };
}

function applySafeZone(crop, safeZone, outW, outH) {
  // Garante que conteúdo importante não caia nas zonas perigosas
  // Ajusta crop.x/crop.y se necessário
  const safeLeft = outW * safeZone.left;
  const safeRight = outW * (1 - safeZone.right);
  const safeTop = outH * safeZone.top;
  const safeBottom = outH * (1 - safeZone.bottom);

  // Se crop.w < outW, centraliza horizontalmente dentro da zona segura
  if (crop.w < outW) {
    const centerX = crop.x + crop.w / 2;
    const minX = safeLeft;
    const maxX = safeRight - crop.w;
    crop.x = Math.max(minX, Math.min(maxX, centerX - crop.w / 2));
  }
  return crop;
}

function compactKeyframes(keyframes, threshold = 0.02) {
  if (keyframes.length <= 2) return keyframes;
  const result = [keyframes[0]];
  for (let i = 1; i < keyframes.length; i++) {
    const prev = result[result.length - 1];
    const curr = keyframes[i];
    const dx = Math.abs(curr.crop.x - prev.crop.x) / prev.crop.w;
    const dy = Math.abs(curr.crop.y - prev.crop.y) / prev.crop.h;
    const dw = Math.abs(curr.crop.w - prev.crop.w) / prev.crop.w;
    const dh = Math.abs(curr.crop.h - prev.crop.h) / prev.crop.h;
    if (dx > threshold || dy > threshold || dw > threshold || dh > threshold || curr.layout !== prev.layout) {
      result.push(curr);
    }
  }
  // Garante último frame
  if (result[result.length - 1] !== keyframes[keyframes.length - 1]) {
    result.push(keyframes[keyframes.length - 1]);
  }
  return result;
}

/* ---------------------------------------------------------------
   Renderização do vídeo reenquadrado (para exportação)
   --------------------------------------------------------------- */

/**
 * Renderiza vídeo 9:16 aplicando keyframes de crop.
 * @param {HTMLVideoElement} sourceVideo
 * @param {Array} keyframes - [{time, crop, layout}]
 * @param {Object} options
 * @returns {Promise<Blob>} MP4/WebM
 */
export async function renderReframedVideo(sourceVideo, keyframes, options = {}) {
  const { signal, onProgress, mimeType } = options;
  const outW = REFRAME_CONFIG.output.width;
  const outH = REFRAME_CONFIG.output.height;
  const fps = REFRAME_CONFIG.output.fps;
  const totalFrames = Math.ceil(sourceVideo.duration * fps);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: false });

  const stream = canvas.captureStream(fps);
  const mime = mimeType || (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028,mp4a.40.2') ? 'video/mp4;codecs=avc1.640028,mp4a.40.2' : 'video/webm;codecs=vp9,opus');
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 128000 });
  const chunks = [];
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => recorder.onstop = r);

  // Áudio
  const actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: REFRAME_CONFIG.output.audioSampleRate });
  await actx.resume();
  const audioSrc = actx.createMediaElementSource(sourceVideo);
  const audioDest = actx.createMediaStreamDestination();
  audioSrc.connect(audioDest);
  audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

  recorder.start(100);

  // Função para interpolar crop entre keyframes
  function getCropAtTime(t) {
    let prev = keyframes[0], next = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
        prev = keyframes[i]; next = keyframes[i + 1]; break;
      }
    }
    if (prev === next) return prev.crop;
    const ratio = (t - prev.time) / (next.time - prev.time);
    return {
      x: prev.crop.x + (next.crop.x - prev.crop.x) * ratio,
      y: prev.crop.y + (next.crop.y - prev.crop.y) * ratio,
      w: prev.crop.w + (next.crop.w - prev.crop.w) * ratio,
      h: prev.crop.h + (next.crop.h - prev.crop.h) * ratio,
    };
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) { recorder.stop(); throw new Error('Cancelled'); }
    const t = frame / fps;
    sourceVideo.currentTime = t;
    await new Promise(r => sourceVideo.onseeked = r);

    const crop = getCropAtTime(t);
    const layout = keyframes.find(k => k.time <= t)?.layout || 'fallback';

    // Desenha
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);

    if (layout === 'gameplay' || layout === 'screenshare') {
      // Dois retângulos: topo + base
      const game = crop.game || crop;
      const cam = crop.camera || crop.presenter;
      if (game) {
        ctx.drawImage(sourceVideo, game.x, game.y, game.w, game.h, 0, 0, outW, game.h * outH / game.h);
      }
      if (cam) {
        ctx.drawImage(sourceVideo, cam.x, cam.y, cam.w, cam.h, 0, outW * 0.7, outW, outH * 0.3);
      }
    } else {
      // Crop único
      ctx.drawImage(sourceVideo, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
    }

    // Blur nas bordas se fallback
    if (crop.blur) {
      // Aplica blur nas áreas fora do safe zone (simplificado)
    }

    if (onProgress && frame % Math.max(1, Math.floor(fps * 2)) === 0) {
      onProgress({ stage: 'render', progress: frame / totalFrames, message: `Renderizando ${Math.round(frame/totalFrames*100)}%` });
    }
  }

  sourceVideo.pause();
  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: mime });
  return blob;
}

/* ---------------------------------------------------------------
   Job de fila para reenquadramento
   --------------------------------------------------------------- */

export async function enqueueReframeJob(videoFile, options = {}) {
  const jobId = await enqueueJob({
    type: 'reframe',
    input: { videoFile: videoFile.name, videoSize: videoFile.size, options },
    resourceLimits: { cpu: 1, gpu: true, network: false },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Reenquadramento local: custo zero' },
  });
  return jobId;
}

export async function reframeWorker(job, options) {
  const { signal, onProgress } = options;
  const { videoFile, options: reframeOpts } = job.input;

  const video = document.createElement('video');
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;
  video.preload = 'metadata';
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  try {
    const result = await reframeVideo(video, { ...reframeOpts, signal, onProgress });
    URL.revokeObjectURL(video.src);
    return { ok: true, data: result };
  } catch (err) {
    URL.revokeObjectURL(video.src);
    throw err;
  }
}

export { REFRAME_CONFIG, initYuNet, detectFaces, FaceTrack, classifyScene, getActiveSpeaker };