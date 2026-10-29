/* ============================================================
   APOLLOCUT — limpeza e correção de palavras transcritas
   Anti-alucinação, ordem monotônica e vocabulário do usuário.
   Módulo puro: usado pelo worker/controller e pelos testes.
   ============================================================ */

import { normalizeForCompare, stripAccents } from './normalize.js';

/** Frases fantasma clássicas do Whisper em pt-BR. */
const FANTASMAS = [
  /^(legendas?|subtitles?)\s+(pela|da|by the)\s+(comunidade\s+)?amara(\.org)?/i,
  /^obrigad[oa]s?\s+por\s+assistir/i,
  /^thanks?\s+for\s+watching/i,
  /^(se\s+)?inscreva-?se\s+(no|em\s+seu)\s+canal/i,
  /^n[ãa]o\s+se\s+esque[çc]a\s+de\s+(curtir|se\s+inscrever)/i,
  /^at[ée]\s+a\s+pr[óo]xima/i,
  /^tchau[!.]?$/i,
  /^you$/i,
];

function countWords(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Remove palavras que formam frases fantasma no começo ou no fim,
 * e laços de repetição (mesma sequência 3+ vezes seguidas).
 */
export function cleanWords(words) {
  if (!Array.isArray(words) || !words.length) return [];

  const list = words
    .map((w) => ({ ...w, text: String(w.text ?? '').trim() }))
    .filter((w) => w.text);

  // Fantasmas nas pontas.
  for (let pass = 0; pass < 2; pass++) {
    const text = list.map((w) => w.text).join(' ');
    let cut = 0;
    for (const rx of FANTASMAS) {
      const head = rx.exec(text);
      if (head) cut = Math.max(cut, countWords(head[0]));
    }
    if (cut) list.splice(0, Math.min(cut, list.length));
    if (!list.length) return [];

    const tailText = list.map((w) => w.text).join(' ');
    let tail = 0;
    for (const rx of FANTASMAS) {
      // Os padrões já vêm ancorados em ^; para a cauda vale só o fim.
      const source = rx.source.replace(/^\^/, '');
      const m = new RegExp(`(?:${source})$`, 'i').exec(tailText);
      if (m) tail = Math.max(tail, countWords(m[0]));
    }
    if (tail) list.splice(Math.max(0, list.length - tail), tail);
    if (!list.length) return [];
  }

  // Laços: "não não não não" ou uma frase repetida 3+ vezes.
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const key = normalizeForCompare(list[i].text).join(' ');
    const prev = out[out.length - 1];
    const prevKey = prev ? normalizeForCompare(prev.text).join(' ') : '';
    if (key && key === prevKey) {
      // conta quantas iguais já estão no fim
      let run = 0;
      for (let k = out.length - 1; k >= 0; k--) {
        if (normalizeForCompare(out[k].text).join(' ') !== key) break;
        run++;
      }
      if (run >= 2) continue;
    }
    out.push(list[i]);
  }
  return out;
}

/** Ordem crescente, sem tempo negativo, sem sobreposição, sem buraco artificial. */
export function monotonic(words, duration = Infinity) {
  const list = words
    .filter((w) => w && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)))
    .map((w) => ({ ...w, start: Math.max(0, Number(w.start)), end: Math.max(0, Number(w.end)) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // O modelo às vezes devolve um bloco com fim muito depois da palavra
  // seguinte; sem este corte, empurrar uma palavra achata a frase inteira.
  for (let i = 0; i < list.length - 1; i++) {
    const atual = list[i];
    const proxima = list[i + 1];
    if (proxima.start > atual.start && atual.end > proxima.start) atual.end = proxima.start;
  }

  let last = 0;
  for (const w of list) {
    if (w.start < last) w.start = last;
    if (w.end <= w.start) w.end = w.start + 0.06;
    if (w.start > duration) { w.start = duration; w.end = duration; }
    // O modelo pode devolver o fim do último bloco além do áudio (chunk com
    // stride); sem este corte a legenda fica 20 s pendurada no fim do corte.
    else if (w.end > duration) w.end = duration;
    last = w.end;
  }
  return list.filter((w) => w.end > w.start);
}

/** Esqueleto consonantal: "nubank"→"nbnk", "nobanquia"→"nbnq". */
export function skeleton(word) {
  const plain = stripAccents(String(word ?? '')).toLowerCase().replace(/[^a-z]/g, '');
  if (!plain) return '';
  const head = plain[0];
  const rest = plain.slice(1).replace(/[aeiou]/g, '');
  return (head + rest).replace(/(.)\1+/g, '$1');
}

function distance(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev = new Array(m + 1);
  let cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

function termMatches(candidate, term) {
  const c = skeleton(candidate);
  const t = skeleton(term);
  if (!c || !t) return false;
  if (Math.abs(c.length - t.length) > 2) return false;
  const ratio = c.length / t.length;
  if (ratio < 0.6 || ratio > 1.7) return false;
  // Termo curto (sigla) não admite troca de letra: "para" (pr) não é "PIX" (px).
  const tolerancia = t.length <= 2 ? 0 : t.length <= 4 ? 1 : 2;
  return distance(c, t) <= tolerancia;
}

function termMatchesStrict(candidate, term) {
  const c = skeleton(candidate);
  return !!c && c === skeleton(term);
}

function parts(term) {
  return String(term).trim().split(/\s+/).filter(Boolean);
}

/**
 * Aproxima o texto transcrito dos termos informados pelo usuário
 * ("Palavras difíceis").
 *
 * - Um token pode virar um termo inteiro ("morrole" → "mó role").
 * - Um termo de uma palavra pode juntar dois tokens ("no banquia" → "Nubank").
 * - Um termo composto só junta dois tokens se cada parte for reconhecível,
 *   senão "o morrole" viraria "mó role" e o "o" sumiria.
 */
export function applyVocabulary(words, terms) {
  const lista = (terms || []).map((t) => String(t).trim()).filter((t) => t.length >= 3);
  if (!lista.length || !words.length) return words;

  const chave = (t) => normalizeForCompare(t).join(' ');
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    let matched = lista.find((t) => termMatches(w.text, t));

    if (!matched && next) {
      const junto = `${w.text} ${next.text}`;
      // Juntar dois tokens só quando o segundo sozinho não serve: senão
      // "no Instagram" viraria "Instagram" e o "no" sumiria do texto.
      matched = lista.find((t) => parts(t).length === 1 && !termMatches(next.text, t) && termMatches(junto, t));
      if (!matched) {
        matched = lista.find((t) => {
          const p = parts(t);
          return p.length === 2 && termMatchesStrict(w.text, p[0]) && termMatchesStrict(next.text, p[1]);
        });
      }
      if (matched) {
        out.push({ ...w, text: matched, end: next.end });
        i++;
        continue;
      }
    }

    if (matched && chave(w.text) !== chave(matched)) out.push({ ...w, text: matched });
    else out.push(w);
  }
  return out;
}

/** Remove palavras de baixíssima confiança no meio de silêncio longo. */
export function dropLowConfidence(words, threshold = 0.35) {
  if (!words.length) return words;
  return words.filter((w) => {
    const c = Number(w.confidence);
    return !Number.isFinite(c) || c >= threshold;
  });
}
