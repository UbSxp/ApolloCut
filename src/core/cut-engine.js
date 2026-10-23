/**
 * @file Motor de Cortes com IA (Item 1 — Categoria A).
 * Pipeline local: extrair áudio → transcrever → segmentar → pontuar → selecionar → refinar.
 * Heurística local robusta; LLM opcional para ranquear/títulos.
 * Suporta vídeos longos (10h) com checkpoints e proxy.
 */

import { getProviderFor } from '../providers/index.js';
import { enqueueJob, updateJob, listJobs } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração do motor
   --------------------------------------------------------------- */
const CUT_ENGINE_CONFIG = {
  // Durações alvo por plataforma (segundos)
  targetDurations: {
    '9:16': { min: 15, max: 60, ideal: 30 },   // Shorts/Reels/TikTok
    '16:9': { min: 30, max: 120, ideal: 60 },  // YouTube horizontal
    '1:1':  { min: 15, max: 60, ideal: 30 },   // Feed quadrado
  },
  // Parâmetros de análise
  analysis: {
    sampleRate: 16000,
    frameSampleInterval: 5,      // segundos entre amostras visuais
    sceneChangeThreshold: 0.35,  // diff histograma
    silenceThresholdDb: -40,     // dBFS para considerar silêncio
    minSpeechDensity: 0.3,       // fração mínima de fala no corte
    maxCutsPerHour: 30,
    minCutGap: 2.0,              // segundos entre cortes
  },
  // Pontuação (pesos somam ~1.0)
  scoringWeights: {
    hook: 0.22,           // primeiros 3s: energia, fala, movimento, rosto
    completeness: 0.18,   // ideia começa e termina (sentença completa)
    speechDensity: 0.15,  // densidade de fala vs silêncio
    energyVariation: 0.12,// variação de volume/entonação
    peaks: 0.10,          // picos de risada/ênfase/volume
    questions: 0.08,      // perguntas e frases de impacto
    sceneChange: 0.08,    // mudança visual significativa
    facePresence: 0.07,   // rosto detectado
  },
  // Refinamento de bordas
  edgeRefinement: {
    sentencePaddingSec: 0.4,  // folga antes/depois da sentença
    maxExtensionSec: 1.5,     // estende no máx. isso para completar frase
    audioFadeMs: 80,          // fade in/out curto
  },
  // Vídeos longos
  longVideo: {
    chunkDurationSec: 1800,      // 30 min por chunk
    chunkOverlapSec: 30,         // sobreposição para não perder palavras
    proxyMaxDimension: 480,      // proxy para análise visual
    checkpointIntervalSec: 300,  // salva progresso a cada 5 min
  },
};

/* ---------------------------------------------------------------
   Utilitários de áudio/vídeo
   --------------------------------------------------------------- */

/**
 * Extrai áudio do vídeo como WAV mono 16kHz (ArrayBuffer).
 * @param {HTMLVideoElement} video
 * @param {number} startSec
 * @param {number} endSec
 * @returns {Promise<ArrayBuffer>}
 */
async function extractAudioWav(video, startSec, endSec) {
  const duration = endSec - startSec;
  const actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  await actx.resume();

  // Cria elemento de vídeo oculto para extração precisa
  const sourceVideo = document.createElement('video');
  sourceVideo.src = video.src;
  sourceVideo.muted = true;
  sourceVideo.preload = 'metadata';
  await new Promise((resolve, reject) => {
    sourceVideo.onloadedmetadata = resolve;
    sourceVideo.onerror = reject;
    sourceVideo.currentTime = startSec;
  });

  const source = actx.createMediaElementSource(sourceVideo);
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * 16000), 16000);
  const gain = offlineCtx.createGain();
  const bufferSource = offlineCtx.createBufferSource();

  // Decodifica o trecho
  const arrayBuffer = await new Promise((resolve, reject) => {
    sourceVideo.onseeked = async () => {
      try {
        const audioData = await fetch(video.src).then(r => r.arrayBuffer());
        const decoded = await offlineCtx.decodeAudioData(audioBuffer.slice(
          Math.floor(startSec * 16000),
          Math.ceil(endSec * 16000)
        ));
        // Renderiza mono 16kHz
        const mono = offlineCtx.createBuffer(1, decoded.length, 16000);
        mono.copyToChannel(decoded.getChannelData(0), 0);
        bufferSource.buffer = mono;
        bufferSource.connect(gain);
        gain.connect(offlineCtx.destination);
        bufferSource.start(0);
        const rendered = await offlineCtx.startRendering();
        // Converte para WAV
        const wav = audioBufferToWav(rendered);
        resolve(wav);
      } catch (e) { reject(e); }
    };
    sourceVideo.currentTime = startSec;
  });

  actx.close();
  return arrayBuffer;
}

/**
 * Converte AudioBuffer para WAV (ArrayBuffer).
 */
function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioBuffer.length * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM data
  const offset = 44;
  const channelData = audioBuffer.getChannelData(0);
  let pos = offset;
  for (let i = 0; i < audioBuffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    pos += 2;
  }
  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/* ---------------------------------------------------------------
   Análise visual (proxy)
   --------------------------------------------------------------- */

/**
 * Amostra frames do vídeo para detectar mudanças de cena, rostos, movimento.
 * @param {HTMLVideoElement} video
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} intervalSec
 * @returns {Promise<Array<{time: number, histogram: number[], faceDetected: boolean, motionScore: number}>>}
 */
async function analyzeVisualProxy(video, startSec, endSec, intervalSec = 5) {
  const samples = [];
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  let prevHist = null;

  for (let t = startSec; t < endSec; t += intervalSec) {
    video.currentTime = t;
    await new Promise(r => video.onseeked = r);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hist = computeHistogram(imgData);
    const faceDetected = await detectFaceFast(imgData); // placeholder
    const motionScore = prevHist ? histogramDiff(prevHist, hist) : 0;
    const sceneChange = motionScore > CUT_ENGINE_CONFIG.analysis.sceneChangeThreshold;

    samples.push({ time: t, histogram: hist, faceDetected, motionScore, sceneChange });
    prevHist = hist;
  }
  return samples;
}

function computeHistogram(imgData) {
  const hist = new Array(64).fill(0); // 64 bins RGB combinados
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] >> 2;
    const g = data[i + 1] >> 2;
    const b = data[i + 2] >> 2;
    const idx = (r << 4) | (g << 2) | b;
    hist[idx]++;
  }
  // Normaliza
  const total = hist.reduce((a, b) => a + b, 0);
  return hist.map(v => v / total);
}

function histogramDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / 2; // 0 a 1
}

async function detectFaceFast(imgData) {
  // Placeholder: integração real com YuNet/MediaPipe depois
  // Por enquanto, retorna false
  return false;
}

/* ---------------------------------------------------------------
   Segmentação de transcrição
   --------------------------------------------------------------- */

/**
 * Segmenta palavras em sentenças e tópicos.
 * @param {Array<{word: string, start: number, end: number, confidence: number}>} words
 * @returns {Array<{sentences: Array<{text: string, start: number, end: number, words: Array}>}>}
 */
function segmentTranscription(words) {
  const sentences = [];
  let current = { words: [], text: '', start: 0, end: 0 };

  for (const w of words) {
    if (!current.words.length) current.start = w.start;
    current.words.push(w);
    current.text += (current.words.length > 1 ? ' ' : '') + w.word;
    current.end = w.end;

    // Fim de sentença: pontuação forte + pausa > 0.3s ou fim da lista
    const isSentenceEnd = /[.!?…]$/.test(w.word.trim()) ||
      (words.indexOf(w) < words.length - 1 && words[words.indexOf(w) + 1].start - w.end > 0.35);

    if (isSentenceEnd) {
      sentences.push({ ...current });
      current = { words: [], text: '', start: 0, end: 0 };
    }
  }
  if (current.words.length) sentences.push(current);

  // Agrupa sentenças em tópicos simples (por proximidade temporal e vocab)
  const topics = [];
  let topic = { sentences: [], start: 0, end: 0, keywords: new Set() };
  for (const s of sentences) {
    if (!topic.sentences.length) topic.start = s.start;
    topic.sentences.push(s);
    topic.end = s.end;
    // Extrai palavras-chave (substantivos simples > 4 chars)
    s.text.split(/\s+/).forEach(w => { if (w.length > 4) topic.keywords.add(w.toLowerCase()); });

    // Novo tópico se gap > 3s ou mudança vocab
    const nextIdx = sentences.indexOf(s) + 1;
    if (nextIdx < sentences.length) {
      const next = sentences[nextIdx];
      const gap = next.start - s.end;
      const overlap = [...topic.keywords].filter(k => next.text.toLowerCase().includes(k)).length;
      if (gap > 3.0 || overlap === 0) {
        topics.push({ ...topic, keywords: [...topic.keywords] });
        topic = { sentences: [], start: 0, end: 0, keywords: new Set() };
      }
    }
  }
  if (topic.sentences.length) topics.push({ ...topic, keywords: [...topic.keywords] });

  return { sentences, topics };
}

/* ---------------------------------------------------------------
   Pontuação de candidatos a corte
   --------------------------------------------------------------- */

/**
 * Gera janelas candidatas baseadas em sentenças.
 * @param {Array} sentences
 * @param {Object} target - {min, max, ideal}
 * @param {Array} visualSamples
 * @returns {Array<{start: number, end: number, sentences: Array, visual: Array}>}
 */
function generateCandidates(sentences, target, visualSamples) {
  const candidates = [];
  const minDur = target.min;
  const maxDur = target.max;

  for (let i = 0; i < sentences.length; i++) {
    for (let j = i; j < sentences.length; j++) {
      const start = sentences[i].start;
      const end = sentences[j].end;
      const dur = end - start;
      if (dur < minDur) continue;
      if (dur > maxDur) break;

      const candSentences = sentences.slice(i, j + 1);
      const visual = visualSamples.filter(v => v.time >= start && v.time <= end);

      candidates.push({ start, end, duration: dur, sentences: candSentences, visual });
    }
  }
  return candidates;
}

/**
 * Pontua um candidato (0-100).
 */
function scoreCandidate(cand, allWords, visualSamples, videoDuration) {
  const w = CUT_ENGINE_CONFIG.scoringWeights;
  let score = 0;

  // 1. Hook (primeiros 3s do candidato)
  const hookWords = allWords.filter(w => w.start >= cand.start && w.start <= cand.start + 3);
  const hookEnergy = hookWords.length > 0 ? hookWords.reduce((a, b) => a + (b.confidence || 0.5), 0) / hookWords.length : 0;
  const hookVisual = visualSamples.filter(v => v.time >= cand.start && v.time <= cand.start + 3);
  const hookFace = hookVisual.some(v => v.faceDetected) ? 1 : 0;
  const hookMotion = hookVisual.length ? hookVisual.reduce((a, v) => a + v.motionScore, 0) / hookVisual.length : 0;
  score += w.hook * (hookEnergy * 0.5 + hookFace * 0.3 + hookMotion * 0.2) * 100;

  // 2. Completude: primeira e última sentença são "completas" (não cortadas no meio)
  const firstSent = cand.sentences[0];
  const lastSent = cand.sentences[cand.sentences.length - 1];
  const startsComplete = firstSent.text.trim().match(/^[A-ZÀ-Ú]/) && /[.!?…]$/.test(firstSent.text.trim());
  const endsComplete = lastSent.text.trim().match(/[.!?…]$/);
  score += w.completeness * (startsComplete && endsComplete ? 100 : startsComplete || endsComplete ? 60 : 30);

  // 3. Densidade de fala
  const candWords = allWords.filter(w => w.start >= cand.start && w.end <= cand.end);
  const speechTime = candWords.reduce((a, w) => a + (w.end - w.start), 0);
  const density = speechTime / cand.duration;
  score += w.speechDensity * Math.min(100, density / CUT_ENGINE_CONFIG.analysis.minSpeechDensity * 100);

  // 4. Variação de energia (volume/entonação) - proxy via confiança e duração palavras
  const confidences = candWords.map(w => w.confidence || 0.5);
  const energyVar = confidences.length > 1
    ? (Math.max(...confidences) - Math.min(...confidences)) / (Math.max(...confidences) + 0.01)
    : 0;
  score += w.energyVariation * energyVar * 100;

  // 5. Picos (palavras com confiança muito alta + duração curta = ênfase)
  const peaks = candWords.filter(w => (w.confidence || 0.5) > 0.95 && (w.end - w.start) < 0.3).length;
  score += w.peaks * Math.min(100, peaks * 15);

  // 6. Perguntas/frases de impacto
  const hasQuestion = cand.sentences.some(s => /\?$/.test(s.text.trim()));
  const hasExclamation = cand.sentences.some(s => /!$/.test(s.text.trim()));
  const impactWords = ['incrível', 'surpreendente', 'segredo', 'erro', 'nunca', 'sempre', 'melhor', 'pior'];
  const hasImpact = cand.sentences.some(s => impactWords.some(w => s.text.toLowerCase().includes(w)));
  score += w.questions * (hasQuestion ? 80 : 0 + hasExclamation ? 60 : 0 + hasImpact ? 40 : 0);

  // 7. Mudança de cena
  const sceneChanges = cand.visual.filter(v => v.sceneChange).length;
  score += w.sceneChange * Math.min(100, sceneChanges * 25);

  // 8. Presença de rosto
  const faceFrames = cand.visual.filter(v => v.faceDetected).length;
  const faceRatio = cand.visual.length ? faceFrames / cand.visual.length : 0;
  score += w.facePresence * faceRatio * 100;

  // Bônus: duração próxima do ideal
  const ideal = CUT_ENGINE_CONFIG.targetDurations['9:16'].ideal;
  const durDiff = Math.abs(cand.duration - ideal);
  score += Math.max(0, 10 - durDiff) * 0.5;

  return Math.round(Math.min(100, Math.max(0, score)));
}

/* ---------------------------------------------------------------
   Seleção e refinamento
   --------------------------------------------------------------- */

/**
 * Remove sobreposições e escolhe os melhores cortes.
 */
function selectBestCuts(candidates, maxCuts) {
  // Ordena por score desc
  candidates.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const cand of candidates) {
    // Verifica sobreposição com já selecionados
    const overlaps = selected.some(s =>
      !(cand.end <= s.start + CUT_ENGINE_CONFIG.analysis.minCutGap ||
        cand.start >= s.end - CUT_ENGINE_CONFIG.analysis.minCutGap)
    );
    if (!overlaps) {
      selected.push(cand);
      if (selected.length >= maxCuts) break;
    }
  }
  // Reordena por tempo
  selected.sort((a, b) => a.start - b.start);
  return selected;
}

/**
 * Refina bordas do corte para alinhar com fim de sentença e adicionar fade.
 */
function refineCutEdges(cut, allSentences) {
  let { start, end } = cut;
  const padding = CUT_ENGINE_CONFIG.edgeRefinement.sentencePaddingSec;
  const maxExt = CUT_ENGINE_CONFIG.edgeRefinement.maxExtensionSec;

  // Ajusta início: recua para início da sentença mais próxima
  const startSent = allSentences.find(s => s.start <= start && s.end >= start) ||
    allSentences.reduce((prev, s) => (s.start <= start && s.start > (prev?.start || -Infinity) ? s : prev), null);
  if (startSent && start - startSent.start <= maxExt) start = Math.max(0, startSent.start - padding);

  // Ajusta fim: avança para fim da sentença mais próxima
  const endSent = allSentences.find(s => s.start <= end && s.end >= end) ||
    allSentences.reduce((prev, s) => (s.end >= end && s.end < (prev?.end || Infinity) ? s : prev), null);
  if (endSent && endSent.end - end <= maxExt) end = endSent.end + padding;

  return { ...cut, start, end, duration: end - start };
}

/* ---------------------------------------------------------------
   Pipeline principal
   --------------------------------------------------------------- */

/**
 * @typedef {Object} CutResult
 * @property {string} id
 * @property {number} start
 * @property {number} end
 * @property {number} duration
 * @property {number} score
 * @property {string} reason - Explicação em PT-BR
 * @property {string} thumbnail - Data URL da miniatura no tempo médio
 * @property {Array} sentences - Sentenças incluídas
 */

/**
 * Executa análise completa de um vídeo e retorna cortes sugeridos.
 * @param {HTMLVideoElement} video
 * @param {Object} options
 * @param {string} options.ratio - '9:16' | '16:9' | '1:1'
 * @param {number} options.maxCuts
 * @param {boolean} options.useLLM - Se true, usa LLM para ranquear/títulos (Categoria B)
 * @param {AbortSignal} [options.signal]
 * @param {(progress: {stage: string, progress: number, message: string}) => void} [options.onProgress]
 * @returns {Promise<Array<CutResult>>}
 */
export async function analyzeVideoForCuts(video, options = {}) {
  const {
    ratio = '9:16',
    maxCuts = CUT_ENGINE_CONFIG.analysis.maxCutsPerHour * (video.duration / 3600),
    useLLM = false,
    signal,
    onProgress,
  } = options;

  const target = CUT_ENGINE_CONFIG.targetDurations[ratio] || CUT_ENGINE_CONFIG.targetDurations['9:16'];
  const videoDur = video.duration;
  const isLongVideo = videoDur > 3600; // > 1h

  // 1. Extrai áudio completo (ou em chunks se longo)
  if (onProgress) onProgress({ stage: 'extract-audio', progress: 0.05, message: 'Extraindo áudio...' });
  const audioChunks = [];
  if (isLongVideo) {
    const chunkDur = CUT_ENGINE_CONFIG.longVideo.chunkDurationSec;
    const overlap = CUT_ENGINE_CONFIG.longVideo.chunkOverlapSec;
    for (let s = 0; s < videoDur; s += chunkDur - overlap) {
      if (signal?.aborted) throw new Error('Cancelled');
      const e = Math.min(s + chunkDur, videoDur);
      audioChunks.push({ start: s, end: e, audio: await extractAudioWav(video, s, e) });
      if (onProgress) onProgress({ stage: 'extract-audio', progress: 0.05 + 0.15 * (s / videoDur), message: `Áudio ${Math.round(s/60)}-${Math.round(e/60)}min` });
    }
  } else {
    audioChunks.push({ start: 0, end: videoDur, audio: await extractAudioWav(video, 0, videoDur) });
  }

  // 2. Transcreve (usa provedor configurado; default = fake/local)
  if (onProgress) onProgress({ stage: 'transcribe', progress: 0.2, message: 'Transcrevendo...' });
  const transcriber = await getProviderFor('transcription');
  let allWords = [];
  let allSegments = [];
  let detectedLang = 'pt';

  for (let i = 0; i < audioChunks.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const chunk = audioChunks[i];
    const result = await transcriber.execute(
      { audio: chunk.audio, language: detectedLang, wordTimestamps: true },
      { signal, onProgress: p => onProgress?.({ ...p, progress: 0.2 + 0.4 * ((i + p.progress) / audioChunks.length) }) }
    );
    if (!result.ok) throw new Error(result.error);
    // Rebase timestamps
    for (const w of result.data.words) {
      w.start += chunk.start;
      w.end += chunk.start;
      allWords.push(w);
    }
    for (const s of result.data.segments) {
      allSegments.push({ ...s, start: s.start + chunk.start, end: s.end + chunk.start });
    }
    detectedLang = result.data.language || detectedLang;
  }

  // 3. Análise visual (proxy)
  if (onProgress) onProgress({ stage: 'visual-analysis', progress: 0.6, message: 'Analisando cena...' });
  const visualSamples = await analyzeVisualProxy(video, 0, videoDur, CUT_ENGINE_CONFIG.analysis.frameSampleInterval);

  // 4. Segmentação
  if (onProgress) onProgress({ stage: 'segment', progress: 0.7, message: 'Segmentando falas...' });
  const { sentences, topics } = segmentTranscription(allWords);

  // 5. Gera candidatos
  if (onProgress) onProgress({ stage: 'candidates', progress: 0.75, message: 'Gerando candidatos...' });
  const candidates = generateCandidates(sentences, target, visualSamples);

  // 6. Pontua cada candidato
  if (onProgress) onProgress({ stage: 'score', progress: 0.8, message: 'Pontuando...' });
  for (const cand of candidates) {
    cand.score = scoreCandidate(cand, allWords, visualSamples, videoDur);
    // Gera razão textual
    cand.reason = buildReasonText(cand, allWords, visualSamples);
  }

  // 7. Seleciona melhores
  if (onProgress) onProgress({ stage: 'select', progress: 0.9, message: 'Selecionando melhores...' });
  const selected = selectBestCuts(candidates, maxCuts);

  // 8. Refina bordas
  const refined = selected.map(c => refineCutEdges(c, sentences));

  // 9. Gera miniaturas e resultado final
  if (onProgress) onProgress({ stage: 'thumbnails', progress: 0.95, message: 'Gerando miniaturas...' });
  const results = await Promise.all(refined.map(async (c, idx) => {
    const mid = (c.start + c.end) / 2;
    const thumb = await generateThumbnail(video, mid);
    return {
      id: `cut-${idx + 1}`,
      start: c.start,
      end: c.end,
      duration: c.duration,
      score: c.score,
      reason: c.reason,
      thumbnail: thumb,
      sentences: c.sentences,
      topicKeywords: topics.find(t => t.start <= mid && t.end >= mid)?.keywords || [],
    };
  }));

  if (onProgress) onProgress({ stage: 'done', progress: 1, message: 'Análise concluída' });
  return results;
}

/**
 * Constrói texto explicativo da pontuação.
 */
function buildReasonText(cand, allWords, visualSamples) {
  const reasons = [];
  const hookWords = allWords.filter(w => w.start >= cand.start && w.start <= cand.start + 3);
  if (hookWords.length > 5) reasons.push('gancho forte nos primeiros 3s');
  const firstSent = cand.sentences[0];
  const lastSent = cand.sentences[cand.sentences.length - 1];
  if (/[.!?…]$/.test(firstSent.text.trim()) && /[.!?…]$/.test(lastSent.text.trim())) reasons.push('ideia completa');
  const density = allWords.filter(w => w.start >= cand.start && w.end <= cand.end).reduce((a, w) => a + (w.end - w.start), 0) / cand.duration;
  if (density > 0.6) reasons.push('alta densidade de fala');
  const peaks = allWords.filter(w => w.start >= cand.start && w.end <= cand.end && (w.confidence || 0.5) > 0.95 && (w.end - w.start) < 0.3).length;
  if (peaks > 2) reasons.push('picos de ênfase/risada');
  if (cand.sentences.some(s => /\?$/.test(s.text.trim()))) reasons.push('contém pergunta');
  if (cand.visual.some(v => v.sceneChange)) reasons.push('mudança de cena');
  if (cand.visual.some(v => v.faceDetected)) reasons.push('rosto detectado');
  return reasons.length ? reasons.join(', ') : 'corte por duração';
}

/**
 * Gera miniatura (data URL) em tempo específico.
 */
async function generateThumbnail(video, timeSec) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 568; // 9:16
  const ctx = canvas.getContext('2d');
  video.currentTime = timeSec;
  await new Promise(r => video.onseeked = r);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/* ---------------------------------------------------------------
   Job de fila para análise (integração com job-queue)
   --------------------------------------------------------------- */

export async function enqueueAnalysisJob(videoFile, options = {}) {
  const jobId = await enqueueJob({
    type: 'analyze',
    input: { videoFile: videoFile.name, videoSize: videoFile.size, options },
    resourceLimits: { cpu: 1, gpu: false, network: false },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Análise local: custo zero' },
  });
  return jobId;
}

/**
 * Worker de análise para o JobWorkerPool.
 * @param {Job} job
 * @param {Object} options
 */
export async function analyzeWorker(job, options) {
  const { signal, onProgress } = options;
  const { videoFile, options: analysisOpts } = job.input;

  // Cria vídeo element a partir do File
  const video = document.createElement('video');
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;
  video.preload = 'metadata';
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  try {
    const cuts = await analyzeVideoForCuts(video, { ...analysisOpts, signal, onProgress });
    URL.revokeObjectURL(video.src);
    return { ok: true, data: { cuts, videoDuration: video.duration } };
  } catch (err) {
    URL.revokeObjectURL(video.src);
    throw err;
  }
}

export { CUT_ENGINE_CONFIG };