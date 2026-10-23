/**
 * @file Dublagem de Áudio com IA (Item 8 — Categoria B).
 * TTSProvider (fake + real: ElevenLabs, Coqui, Piper, Windows SAPI, macOS say).
 * Sync com vídeo, múltiplos idiomas, seleção de voz, controle de velocidade.
 * Integração com editor: bulk-dub cortes aprovados, substituição de faixa de áudio.
 */

import { getProviderFor } from '../providers/index.js';
import { enqueueJob, updateJob } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração de Dublagem
   --------------------------------------------------------------- */
const DUBBING_CONFIG = {
  // Vozes disponíveis por provedor/idioma
  voices: {
    elevenlabs: {
      pt: [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', preview: '' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', preview: '' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', preview: '' },
      ],
      en: [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', preview: '' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', preview: '' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', preview: '' },
      ],
      es: [
        { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Ethan', gender: 'male', preview: '' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Grace', gender: 'female', preview: '' },
      ],
    },
    coqui: {
      pt: ['pt_br_female_1', 'pt_br_male_1'],
      en: ['en_female_1', 'en_male_1', 'en_female_2'],
      es: ['es_female_1', 'es_male_1'],
    },
    piper: {
      pt: ['pt_BR-faber-medium', 'pt_BR-ana-medium'],
      en: ['en_US-lessac-medium', 'en_US-amy-low'],
      es: ['es_ES-carlfm-medium', 'es_ES-davefx-medium'],
    },
    sapi: { // Windows SAPI
      pt: ['Microsoft Maria', 'Microsoft Daniel'],
      en: ['Microsoft Zira', 'Microsoft David'],
      es: ['Microsoft Helena', 'Microsoft Pablo'],
    },
    say: { // macOS say
      pt: ['Luciana', 'Joana'],
      en: ['Samantha', 'Alex', 'Victoria'],
      es: ['Monica', 'Jorge'],
    },
  },
  // Configurações padrão
  defaults: {
    speed: 1.0,        // 0.5 a 2.0
    pitch: 1.0,        // 0.5 a 2.0 (se suportado)
    volume: 1.0,       // 0 a 1
    format: 'mp3',     // mp3, wav, opus
    crossfadeMs: 50,   // fade entre segmentos
  },
  // Limites
  limits: {
    maxCharsPerRequest: 3000,
    maxDurationSec: 300, // 5 min por segmento
  },
};

/* ---------------------------------------------------------------
   Utilitários de Áudio
   --------------------------------------------------------------- */

/**
 * Converte ArrayBuffer de áudio para AudioBuffer (Web Audio API).
 * @param {ArrayBuffer} arrayBuffer
 * @param {AudioContext} actx
 * @returns {Promise<AudioBuffer>}
 */
export async function arrayBufferToAudioBuffer(arrayBuffer, actx) {
  return actx.decodeAudioData(arrayBuffer.slice(0));
}

/**
 * Concatena múltiplos AudioBuffers com crossfade.
 * @param {AudioBuffer[]} buffers
 * @param {number} crossfadeMs
 * @returns {AudioBuffer}
 */
export function concatAudioBuffers(buffers, crossfadeMs = 50) {
  if (buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];

  const sampleRate = buffers[0].sampleRate;
  const crossfadeFrames = Math.round(crossfadeMs / 1000 * sampleRate);
  let totalLength = 0;
  for (const b of buffers) totalLength += b.length;
  // Subtrai overlap
  totalLength -= crossfadeFrames * (buffers.length - 1);

  const result = new AudioBuffer({
    numberOfChannels: buffers[0].numberOfChannels,
    length: totalLength,
    sampleRate,
  });

  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i];
    const channels = buf.numberOfChannels;
    const start = i === 0 ? 0 : crossfadeFrames;

    for (let ch = 0; ch < channels; ch++) {
      const input = buf.getChannelData(ch);
      const output = result.getChannelData(ch);

      if (i === 0) {
        output.set(input, offset);
      } else {
        // Crossfade
        const prevBuf = buffers[i - 1];
        const prevData = prevBuf.getChannelData(ch);
        for (let j = 0; j < crossfadeFrames; j++) {
          const t = j / crossfadeFrames;
          const idx = prevBuf.length - crossfadeFrames + j;
          if (idx >= 0 && idx < prevData.length && j < input.length) {
            output[offset + j] = prevData[idx] * (1 - t) + input[j] * t;
          }
        }
        // Resto do buffer
        output.set(input.subarray(crossfadeFrames), offset + crossfadeFrames);
      }
    }
    offset += buf.length - (i > 0 ? crossfadeFrames : 0);
  }
  return result;
}

/**
 * Ajusta velocidade/pitch do AudioBuffer (via resampling simples).
 * @param {AudioBuffer} buffer
 * @param {number} speed - 0.5 a 2.0
 * @param {number} pitch - 0.5 a 2.0 (aproximado via resample)
 * @returns {AudioBuffer}
 */
export function adjustSpeedPitch(buffer, speed = 1.0, pitch = 1.0) {
  if (speed === 1.0 && pitch === 1.0) return buffer;
  // Implementação simplificada: apenas speed via interpolação linear
  // Para pitch real, precisaria de WSOLA ou similar
  const factor = speed * pitch;
  const newLength = Math.round(buffer.length / factor);
  const result = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: newLength,
    sampleRate: buffer.sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch);
    const output = result.getChannelData(ch);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * factor;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;
      if (idx + 1 < input.length) {
        output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
      } else if (idx < input.length) {
        output[i] = input[idx];
      }
    }
  }
  return result;
}

/* ---------------------------------------------------------------
   Dublagem de Corte
   --------------------------------------------------------------- */

/**
 * Dublagem um corte: gera áudio TTS para as sentenças e sincroniza com vídeo.
 * @param {Object} cut - corte do editorState
 * @param {Object} editorState
 * @param {Object} options - { targetLang, voiceId, speed, format, signal, onProgress }
 * @returns {Promise<{audioBuffer: AudioBuffer, segments: Array}>}
 */
export async function dubCut(cut, editorState, options = {}) {
  const {
    targetLang = 'en',
    voiceId,
    speed = DUBBING_CONFIG.defaults.speed,
    format = DUBBING_CONFIG.defaults.format,
    signal,
    onProgress,
  } = options;

  if (!cut.sentences || !cut.sentences.length) throw new Error('Corte sem legendas para dublar');

  const tts = await getProviderFor('tts');
  if (!tts) throw new Error('Nenhum provedor TTS disponível');

  const sourceLang = editorState.project.settings.lang || 'pt';
  const sentences = cut.sentences;
  const audioBuffers = [];
  const segments = [];

  if (onProgress) onProgress({ stage: 'tts', progress: 0.1, message: 'Gerando áudio TTS...' });

  // Processa em lotes (respeita limite de chars)
  let batchText = '';
  let batchSentences = [];
  let charCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const s = sentences[i];
    const text = s.words.map(w => w.text).join(' ');
    const textLen = text.length;

    if (charCount + textLen > DUBBING_CONFIG.limits.maxCharsPerRequest && batchSentences.length > 0) {
      // Processa lote atual
      const result = await processBatch(batchSentences, batchText, tts, targetLang, sourceLang, voiceId, speed, format, signal, onProgress);
      audioBuffers.push(...result.buffers);
      segments.push(...result.segments);
      batchSentences = [];
      batchText = '';
      charCount = 0;
    }

    batchSentences.push(s);
    batchText += (batchText ? ' ||| ' : '') + text;
    charCount += textLen;
  }

  // Último lote
  if (batchSentences.length > 0) {
    const result = await processBatch(batchSentences, batchText, tts, targetLang, sourceLang, voiceId, speed, format, signal, onProgress);
    audioBuffers.push(...result.buffers);
    segments.push(...result.segments);
  }

  if (onProgress) onProgress({ stage: 'concat', progress: 0.9, message: 'Concatenando áudio...' });

  // Concatena com crossfade
  const finalAudio = concatAudioBuffers(audioBuffers, DUBBING_CONFIG.defaults.crossfadeMs);

  // Ajusta velocidade se necessário
  const finalAdjusted = speed !== 1.0 ? adjustSpeedPitch(finalAudio, speed) : finalAudio;

  if (onProgress) onProgress({ stage: 'done', progress: 1, message: 'Dublagem concluída' });

  return { audioBuffer: finalAdjusted, segments };
}

async function processBatch(sentences, text, tts, targetLang, sourceLang, voiceId, speed, format, signal, onProgress) {
  const result = await tts.execute(
    { text, language: targetLang, voice: voiceId, speed, format },
    { signal, onProgress: p => onProgress?.({ ...p, progress: 0.2 + 0.6 * (p.progress || 0) }) }
  );

  if (!result.ok) throw new Error(result.error);

  // Converte para AudioBuffer
  const actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  const audioBuffer = await arrayBufferToAudioBuffer(result.data.audio, actx);

  // Divide em segmentos por sentença (aproximado)
  const buffers = [];
  const segments = [];
  const totalDuration = audioBuffer.duration;
  const textParts = text.split(' ||| ');
  let currentTime = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const textPart = textParts[i] || '';
    const proportion = textPart.length / textParts.join(' ||| ').length;
    const segDuration = totalDuration * proportion;
    const segBuffer = audioBuffer.slice(currentTime, currentTime + segDuration);
    buffers.push(segBuffer);
    segments.push({
      sentenceId: sentences[i].words[0]?.text || `seg-${i}`,
      start: s.start,
      end: s.end,
      audioStart: currentTime,
      audioEnd: currentTime + segDuration,
      text: textPart,
    });
    currentTime += segDuration;
  }

  return { buffers, segments };
}

/* ---------------------------------------------------------------
   Substituição de Faixa de Áudio no Corte
   --------------------------------------------------------------- */

/**
 * Substitui a faixa de áudio original do corte pela dublagem.
 * @param {HTMLVideoElement} video - vídeo original
 * @param {AudioBuffer} dubAudio - áudio dublado
 * @param {number} cutStart - início do corte no vídeo original
 * @param {Object} options
 * @returns {Promise<Blob>} vídeo com áudio substituído (MP4/WebM)
 */
export async function replaceCutAudio(video, dubAudio, cutStart, options = {}) {
  const { signal, onProgress, mimeType } = options;
  const duration = dubAudio.duration;

  // Cria canvas para vídeo
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  // Stream de vídeo
  const videoStream = canvas.captureStream(30);
  const videoTracks = videoStream.getVideoTracks();

  // Stream de áudio do dub
  const actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  const audioDest = actx.createMediaStreamDestination();
  const bufferSource = actx.createBufferSource();
  bufferSource.buffer = dubAudio;
  bufferSource.connect(audioDest);
  bufferSource.start(0);

  const audioTracks = audioDest.stream.getAudioTracks();

  // Combina streams
  const combinedStream = new MediaStream([...videoTracks, ...audioTracks]);

  // Grava
  const mime = mimeType || (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028,mp4a.40.2') ? 'video/mp4;codecs=avc1.640028,mp4a.40.2' : 'video/webm;codecs=vp9,opus');
  const recorder = new MediaRecorder(combinedStream, { mimeType: mime, videoBitsPerSecond: 7000000, audioBitsPerSecond: 128000 });
  const chunks = [];
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => recorder.onstop = r);

  recorder.start(100);

  // Reproduz vídeo sincronizado com áudio
  video.currentTime = cutStart;
  await new Promise(r => video.onseeked = r);
  video.muted = true; // Silencia áudio original

  const startTime = performance.now();
  const totalFrames = Math.ceil(duration * 30);

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) { recorder.stop(); throw new Error('Cancelled'); }
    const t = frame / 30;
    video.currentTime = cutStart + t;
    await new Promise(r => video.onseeked = r);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await new Promise(r => setTimeout(r, 1000 / 30));
  }

  bufferSource.stop();
  video.pause();
  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: recorder.mimeType || mime });
  return blob;
}

/* ---------------------------------------------------------------
   Dublagem em Massa (Editor)
   --------------------------------------------------------------- */

/**
 * Dubla múltiplos cortes aprovados.
 * @param {Set<string>} cutIds
 * @param {Object} editorState
 * @param {Object} options
 * @returns {Promise<Array<{cutId, audioBuffer, segments}>>}
 */
export async function bulkDubCuts(cutIds, editorState, options = {}) {
  const { targetLang = 'en', voiceId, speed, format, useAI = true, onProgress } = options;
  const cuts = editorState.project.cuts.filter(c => cutIds.has(c.id) && c.approved);
  const results = [];

  if (!useAI) {
    // Fallback: apenas copia áudio original (não implementado aqui)
    return [];
  }

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    try {
      const result = await dubCut(cut, editorState, {
        targetLang,
        voiceId,
        speed,
        signal: options.signal,
        onProgress: p => options.onProgress?.({ ...p, cutIndex: i, total: cuts.length }),
      });
      results.push({ cutId: cut.id, ...result });
    } catch (e) {
      console.error(`[Dubbing] Erro no corte ${cut.id}:`, e);
      results.push({ cutId: cut.id, error: e.message });
    }
    if (onProgress) onProgress({ stage: 'dubbing', progress: (i + 1) / cuts.length, message: `Dublando ${i + 1}/${cuts.length}` });
  }
  return results;
}

/**
 * Aplica dublagem aos cortes e prepara para exportação.
 * @param {Array} dubResults - resultados de bulkDubCuts
 * @param {Object} editorState
 * @returns {Promise<void>}
 */
export async function applyDubbingToProject(dubResults, editorState) {
  for (const result of dubResults) {
    if (result.error) continue;
    const cut = editorState.project.cuts.find(c => c.id === result.cutId);
    if (cut) {
      cut.dubbed = true;
      cut.dubLang = result.segments[0]?.targetLang || 'en';
      cut.dubAudioBuffer = result.audioBuffer;
      cut.dubSegments = result.segments;
    }
  }
  editorState.unsavedChanges = true;
}

/* ---------------------------------------------------------------
   Job de Fila para Dublagem em Lote
   --------------------------------------------------------------- */

export async function enqueueBatchDubbingJob(cutIds, options = {}) {
  const jobId = await enqueueJob({
    type: 'batch-dubbing',
    input: { cutIds, options },
    resourceLimits: { cpu: 1, gpu: false, network: true },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Dublagem via TTS (custo por caractere)' },
  });
  return jobId;
}

export async function batchDubbingWorker(job, options) {
  const { signal, onProgress } = options;
  const { cutIds, options: dubOpts } = job.input;
  const editorState = job.input.editorState;
  if (!editorState) throw new Error('editorState não fornecido');

  const results = await bulkDubCuts(cutIds, editorState, { ...dubOpts, signal, onProgress });
  return { ok: true, data: { dubbed: results.filter(r => !r.error).length } };
}

export { DUBBING_CONFIG };