/* ============================================================
   APOLLOCUT — Whisper Worker
   Roda o modelo local (vendor/transformers.bundle.mjs) fora da
   thread da interface. Recebe áudio mono 16 kHz (Float32Array)
   e devolve palavras com tempo individual.
   ============================================================ */

import { trimSilence, alignWordsToSpeech, speechRegions } from '../captions/vad.js';
import { cleanWords, applyVocabulary, monotonic } from '../captions/words.js';
import { normalizeForCompare } from '../captions/normalize.js';
import { MODELS, DEFAULT_MODEL } from '../captions/models.js';

const RATE = 16000;
const JANELA_SEC = 28;
const SOBREPOSICAO_SEC = 1.2;

/**
 * Junta duas janelas descartando as palavras repetidas da sobreposição.
 * Compara o sufixo já transcrito com o prefixo novo; sem isso a emenda
 * duplica uma ou duas palavras.
 */
function juntarSobreposicao(anteriores, novas) {
  const chave = (w) => normalizeForCompare(w.text).join(' ');
  const max = Math.min(anteriores.length, novas.length, 12);
  for (let k = max; k > 0; k--) {
    let igual = true;
    for (let i = 0; i < k && igual; i++) {
      igual = chave(anteriores[anteriores.length - k + i]) === chave(novas[i]);
    }
    if (igual) return anteriores.concat(novas.slice(k));
  }
  return anteriores.concat(novas);
}

let libPromise = null;

async function loadLib() {
  if (!libPromise) {
    libPromise = import('/vendor/transformers.bundle.mjs').then((mod) => {
      mod.env.allowLocalModels = false;
      mod.env.allowRemoteModels = true;
      mod.env.useBrowserCache = true;
      // wasm do onnxruntime servido localmente (sem CDN).
      mod.env.backends.onnx.wasm.wasmPaths = '/vendor/ort/';
      mod.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? 2 : 1;
      return mod;
    });
  }
  return libPromise;
}

const FALLBACK_MODEL = MODELS.tiny;

let cached = { key: '', pipe: null };

async function getPipeline(model, preferWebgpu, onProgress) {
  const device = preferWebgpu && self.navigator?.gpu ? 'webgpu' : 'wasm';
  const dtype = device === 'webgpu' ? 'fp32' : 'q8';
  const key = `${model}|${device}|${dtype}`;
  if (cached.pipe && cached.key === key) return { pipe: cached.pipe, device, model };

  const mod = await loadLib();
  const pipe = await mod.pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (info) => onProgress(info),
  });
  cached = { key, pipe };
  return { pipe, device, model };
}

function toWords(chunks, offset, vocabulary) {
  const words = [];
  const push = (word) => {
    const prev = words[words.length - 1];
    // Sigla quebrada em letras pelo modelo: "CNP" + "J" → "CNPJ".
    if (prev && /^[A-ZÀ-Ý]$/.test(word.text) && /^[A-ZÀ-Ý]{2,}$/.test(prev.text)
      && Math.abs(Number(word.start) - Number(prev.end)) < 0.06) {
      prev.text += word.text;
      prev.end = word.end;
      return;
    }
    words.push(word);
  };

  for (const chunk of chunks || []) {
    const text = String(chunk?.text ?? '').trim();
    if (!text) continue;
    const ts = Array.isArray(chunk.timestamp) ? chunk.timestamp : null;
    const start = ts && Number.isFinite(Number(ts[0])) ? Number(ts[0]) : null;
    const end = ts && Number.isFinite(Number(ts[1])) ? Number(ts[1]) : null;
    if (start == null) continue;
    // Um chunk pode conter mais de uma palavra ("não sei").
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      push({ text, start: start + offset, end: (end == null ? start + 0.2 : end) + offset });
      continue;
    }
    const span = Math.max(0.08, (end == null ? start + 0.2 * parts.length : end) - start);
    const step = span / parts.length;
    parts.forEach((part, i) => {
      push({ text: part, start: start + offset + i * step, end: start + offset + (i + 1) * step });
    });
  }
  return monotonic(applyVocabulary(cleanWords(words), vocabulary));
}

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type !== 'start') return;

  const {
    audio,
    language = 'pt',
    model = DEFAULT_MODEL,
    preferWebgpu = false,
    vocabulary = [],
    trim = true,
  } = data;

  const post = (msg) => self.postMessage(msg);

  try {
    if (!(audio instanceof Float32Array) || audio.length < 1600) {
      throw new Error('Áudio vazio ou curto demais para transcrever.');
    }

    const started = performance.now();
    post({ type: 'stage', stage: 'model', pct: 20, note: 'Carregando modelo local…' });

    // Corta silêncio das pontas: menos alucinação e menos tempo gasto.
    let entrada = audio;
    let offset = 0;
    if (trim) {
      const corte = trimSilence(audio);
      entrada = corte.audio;
      offset = corte.offset;
      if (!corte.voiced) throw new Error('O áudio do corte está mudo ou quase inaudível. Nada para transcrever.');
      if (corte.trimmed > 0.05) {
        post({ type: 'stage', stage: 'prepare', pct: 25, note: `Silêncio removido: ${corte.trimmed.toFixed(1)}s` });
      }
    }

    const progresso = (info) => {
      if (!info) return;
      const total = Number(info.total) || 0;
      const loaded = Number(info.loaded) || 0;
      post({
        type: 'progress',
        stage: 'model',
        file: info.file || '',
        status: info.status,
        pct: total ? Math.min(100, (loaded / total) * 100) : 0,
        loaded,
        total,
      });
    };

    const rodar = async (nome, gpu) => {
      const { pipe, device } = await getPipeline(nome, gpu, progresso);
      const opcoes = {
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
        return_timestamps: 'word',
      };

      // Janelas próprias em vez do chunking do transformers.js: com
      // chunk_length_s/stride ele soma o início do bloco duas vezes nos
      // timestamps por palavra e chega a colapsar 20 s de fala num token só.
      const janela = Math.round(JANELA_SEC * RATE);
      const passo = Math.max(1, Math.round((JANELA_SEC - SOBREPOSICAO_SEC) * RATE));
      const total = entrada.length;
      const varias = total > janela;

      let palavras = [];
      let chunks = 0;
      for (let from = 0; from < total; from += passo) {
        if (varias && total - from < 1.5 * RATE) break;
        const fim = Math.min(total, from + janela);
        const fatia = varias ? entrada.subarray(from, fim) : entrada;
        post({
          type: 'stage',
          stage: 'infer',
          pct: 45 + Math.round((from / total) * 50),
          note: `Transcrevendo (${device.toUpperCase()}) ${Math.round((fim / total) * 100)}%…`,
        });
        const r = await pipe(fatia, opcoes);
        chunks += (r.chunks || []).length;
        const lote = toWords(r.chunks, offset + from / RATE, vocabulary);
        palavras = palavras.length ? juntarSobreposicao(palavras, lote) : lote;
        if (fim >= total) break;
      }
      return { palavras, chunks, device, nome };
    };

    let saida;
    try {
      saida = await rodar(model, preferWebgpu);
    } catch (error) {
      if (preferWebgpu) {
        // WebGPU indisponível/instável: mesmo modelo, agora na CPU.
        post({ type: 'stage', stage: 'model', pct: 25, note: 'WebGPU indisponível; usando a CPU…' });
        try {
          saida = await rodar(model, false);
        } catch (_) { /* cai para o modelo menor */ }
      }
      if (!saida) {
        if (model === FALLBACK_MODEL) throw error;
        post({ type: 'stage', stage: 'model', pct: 25, note: 'Modelo falhou; tentando o modelo menor…' });
        saida = await rodar(FALLBACK_MODEL, false);
      }
    }

    const brutas = monotonic(saida.palavras);
    const words = monotonic(alignWordsToSpeech(brutas, audio));
    post({
      type: 'result',
      text: words.map((w) => w.text).join(' '),
      words,
      debug: { brutas, regioes: speechRegions(audio, 16000, { minGap: 0.4 }) },
      chunks: saida.chunks,
      model: saida.nome,
      device: saida.device,
      trimmed: offset,
      ms: Math.round(performance.now() - started),
    });
  } catch (error) {
    post({ type: 'error', message: String((error && error.message) || error) });
  }
});
