/* ============================================================
   APOLLOCUT — VAD por energia (puro, sem dependências)
   Corta silêncio nas pontas, encontra as regiões de fala e usa
   essas regiões para corrigir os tempos das palavras.
   ============================================================ */

const FRAME_SEC = 0.02;

function frames(audio, rate) {
  const size = Math.max(1, Math.round(rate * FRAME_SEC));
  const total = Math.floor(audio.length / size);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    let sum = 0;
    const base = i * size;
    for (let j = 0; j < size; j++) {
      const v = audio[base + j];
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / size);
  }
  return { rms: out, size };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Remove silêncio do início e do fim.
 * @returns {{audio: Float32Array, offset: number, trimmed: number, voiced: number}}
 */
export function trimSilence(audio, rate = 16000, options = {}) {
  const { minRms = 0.006, ratio = 0.08, padSec = 0.12 } = options;
  if (!audio || audio.length < rate * 0.2) {
    return { audio, offset: 0, trimmed: 0, voiced: 1 };
  }
  const { rms, size } = frames(audio, rate);
  if (!rms.length) return { audio, offset: 0, trimmed: 0, voiced: 1 };

  const p95 = percentile(rms, 0.95);
  const threshold = Math.max(minRms, p95 * ratio);

  let first = -1;
  let last = -1;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] > threshold) { first = i; break; }
  }
  for (let i = rms.length - 1; i >= 0; i--) {
    if (rms[i] > threshold) { last = i; break; }
  }
  if (first < 0 || last < first) {
    return { audio, offset: 0, trimmed: 0, voiced: 0 };
  }

  const pad = Math.round(padSec * rate);
  const start = Math.max(0, first * size - pad);
  const end = Math.min(audio.length, (last + 1) * size + pad);
  if (end - start < rate * 0.3) {
    return { audio, offset: 0, trimmed: 0, voiced: 1 };
  }

  const voicedFrames = rms.reduce((acc, v) => acc + (v > threshold ? 1 : 0), 0);
  return {
    audio: audio.slice(start, end),
    offset: start / rate,
    trimmed: (audio.length - (end - start)) / rate,
    voiced: voicedFrames / rms.length,
  };
}

/** Regiões contínuas com fala (separadas por silêncio). */
export function speechRegions(audio, rate = 16000, options = {}) {
  const { minRms = 0.006, ratio = 0.08, minGap = 0.12 } = options;
  const { rms, size } = frames(audio, rate);
  if (!rms.length) return [];
  const threshold = Math.max(minRms, percentile(rms, 0.95) * ratio);

  const regions = [];
  let start = -1;
  let silence = 0;
  for (let i = 0; i < rms.length; i++) {
    const voiced = rms[i] > threshold;
    if (voiced) {
      if (start < 0) start = i;
      silence = 0;
    } else if (start >= 0) {
      silence++;
      if (silence * FRAME_SEC >= minGap) {
        const end = i - silence + 1;
        regions.push({ start: start * FRAME_SEC, end: end * FRAME_SEC });
        start = -1;
        silence = 0;
      }
    }
  }
  if (start >= 0) regions.push({ start: start * FRAME_SEC, end: (rms.length * size) / rate });
  return regions.filter((r) => r.end - r.start >= 0.06);
}

/**
 * Corrige os tempos por palavra usando a energia do áudio.
 *
 * Problema real do Whisper: ele às vezes atravessa uma pausa longa e coloca a
 * primeira palavra da frase seguinte dentro do silêncio — ou puxa essa palavra
 * para a cauda da frase anterior. Aqui a palavra volta para o início real da
 * fala seguinte, sem mexer no resto da frase.
 */
export function alignWordsToSpeech(words, audio, rate = 16000, options = {}) {
  const {
    maxShift = 3, tolerance = 0.05, tail = 0.3, tailGap = 0.6,
    minGap = 0.4, minShift = 0.2, regions: dadas = null,
  } = options;
  if (!words?.length) return words || [];
  if (!audio?.length && !dadas) return words;

  // Pausas curtas (respiração, oclusivas) não separam frases: só ≥ minGap.
  const regions = dadas || speechRegions(audio, rate, { minGap });
  const out = words.map((w) => ({ ...w }));

  if (regions.length) {
    for (let i = 0; i < out.length; i++) {
      const w = out[i];
      const dentro = regions.find((r) => w.start >= r.start - tolerance && w.start <= r.end + tolerance);
      const proxima = regions.find((r) => r.start > w.start && r.start - w.start <= maxShift);
      const noSilencio = !dentro;
      // Cauda de região só conta quando vem uma pausa longa: a palavra foi
      // puxada para dentro da frase anterior.
      const naCauda = !!dentro && dentro.end - w.start <= tail && !!proxima && proxima.start - dentro.end > tailGap;
      if ((!noSilencio && !naCauda) || !proxima) continue;

      // Só corrige erro grosseiro: deslocar 100 ms espalha erro em vez de tirar.
      // E nunca pula a palavra seguinte: empurrar "né?" até o início de "Eu"
      // empatava os tempos e invertia a ordem das palavras no texto.
      const limite = out[i + 1] ? out[i + 1].start - 0.02 : Infinity;
      const delta = Math.min(proxima.start, limite) - w.start;
      if (delta < minShift) continue;
      for (let k = i; k < out.length; k++) {
        if (k > i && out[k].start >= proxima.start - tolerance) break;
        out[k].start += delta;
        out[k].end += delta;
      }
    }
  }

  return out;
}
