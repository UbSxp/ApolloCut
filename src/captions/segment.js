/* ============================================================
   APOLLOCUT — segmentação de legendas em pt-BR
   Quebra por sentido, respeita pausas e equilibra as linhas.
   Módulo puro: sem DOM, testável em Node.
   ============================================================ */

import { stripAccents, postProcessPt } from './normalize.js';

/** Palavras que não podem abrir um bloco/linha. */
export const NO_START = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'ao', 'aos', 'à', 'às', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'com', 'sem', 'para', 'pra', 'pro', 'sobre', 'entre', 'ate', 'desde', 'apos', 'contra',
  'e', 'ou', 'mas', 'que', 'porque', 'se', 'como', 'quando', 'enquanto', 'porem',
  'me', 'te', 'se', 'lhe', 'nos', 'vos', 'nao', 'ja', 'so', 'muito', 'bem', 'mais', 'menos', 'tao',
  'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa',
]);

/** Conjunções que preferem iniciar um novo bloco. */
const CONJUNCOES = new Set(['e', 'mas', 'porque', 'que', 'porem', 'so', 'entao', 'enquanto']);

export const SEGMENT_PRESETS = {
  curto: {
    maxWords: 7,
    minWords: 2,
    maxChars: 34,
    maxLines: 2,
    maxGap: 0.35,
    hideEndPunct: true,
    breakOnConjunction: true,
  },
  medio: {
    maxWords: 11,
    minWords: 3,
    maxChars: 42,
    maxLines: 2,
    maxGap: 0.7,
    hideEndPunct: false,
    breakOnConjunction: false,
  },
};

function plain(word) {
  return stripAccents(String(word ?? '')).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function endsSentence(word) {
  return /[.!?…]$/.test(String(word ?? ''));
}

function endsClause(word) {
  return /[,;:]$/.test(String(word ?? ''));
}

/**
 * Divide as palavras em blocos de 1–2 linhas.
 * @param {{text:string,start:number,end:number}[]} words
 * @param {object} options sobrescreve SEGMENT_PRESETS.curto
 */
export function segmentWords(words, options = {}) {
  const opts = { ...SEGMENT_PRESETS.curto, ...options };
  const list = (words || []).filter((w) => w && String(w.text || '').trim());
  const groups = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    const lines = layoutLines(current, opts);
    groups.push({
      words: current,
      lines,
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };

  for (let i = 0; i < list.length; i++) {
    const word = list[i];
    const next = list[i + 1];
    current.push(word);

    if (!next) continue;

    const gap = Number(next.start) - Number(word.end);
    const totalChars = current.reduce((acc, w) => acc + w.text.length + 1, -1);
    let mustBreak = false;

    if (gap > opts.maxGap) mustBreak = true;
    if (current.length >= opts.maxWords) mustBreak = true;
    if (totalChars >= opts.maxChars * opts.maxLines) mustBreak = true;
    if (endsSentence(word.text) && current.length >= Math.max(2, opts.minWords)) mustBreak = true;
    if (endsClause(word.text) && current.length >= opts.minWords) mustBreak = true;
    if (opts.breakOnConjunction && current.length >= opts.minWords + 1 && CONJUNCOES.has(plain(next.text))) mustBreak = true;

    if (!mustBreak) continue;

    // Não deixa o próximo bloco começar com palavra dependente:
    // devolve a última palavra do bloco atual para o próximo.
    if (NO_START.has(plain(next.text)) && current.length > 1) {
      const moved = current.pop();
      flush();
      current.push(moved);
    } else {
      flush();
    }
  }
  flush();

  // Junta blocos de uma palavra só com o vizinho, quando não houver pausa.
  const merged = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    const lonely = g.words.length === 1 && !endsSentence(g.words[0].text);
    if (prev && lonely) {
      const gap = Number(g.start) - Number(prev.end);
      const junto = prev.words.concat(g.words);
      const chars = junto.reduce((acc, w) => acc + w.text.length + 1, -1);
      if (gap <= opts.maxGap && junto.length <= opts.maxWords && chars <= opts.maxChars * opts.maxLines) {
        prev.words = junto;
        prev.lines = layoutLines(junto, opts);
        prev.end = g.end;
        continue;
      }
    }
    merged.push(g);
  }
  return merged;
}

/** Distribui as palavras em 1 ou 2 linhas equilibradas, sem quebrar sentido. */
export function layoutLines(words, options = {}) {
  const opts = typeof options === 'number' ? { maxChars: options } : { ...SEGMENT_PRESETS.curto, ...options };
  const maxChars = opts.maxChars;
  const list = words || [];
  if (list.length < 2) return [list.slice()];

  const total = list.map((w) => w.text).join(' ').length;
  if (total <= maxChars) return [list.slice()];

  let best = null;
  for (let i = 1; i < list.length; i++) {
    const left = list.slice(0, i).map((w) => w.text).join(' ');
    const right = list.slice(i).map((w) => w.text).join(' ');
    if (left.length > maxChars || right.length > maxChars) continue;
    if (NO_START.has(plain(list[i].text))) continue;
    const score = Math.abs(left.length - right.length);
    if (!best || score < best.score) best = { i, score };
  }
  if (!best) {
    const i = Math.ceil(list.length / 2);
    return [list.slice(0, i), list.slice(i)];
  }
  return [list.slice(0, best.i), list.slice(best.i)];
}

/** Texto de exibição: esconde . e , no fim do bloco no estilo curto. */
export function displayLines(group, options = {}) {
  const opts = { ...SEGMENT_PRESETS.curto, ...options };
  const lines = group.lines || [group.words || []];
  return lines.map((line, index) => {
    let text = line.map((w) => w.text).join(' ').trim();
    if (opts.hideEndPunct && index === lines.length - 1) {
      text = text.replace(/[.,;:]+$/, '');
    }
    if (opts.postProcess !== false) {
      text = postProcessPt(text, { numbers: opts.numbers !== false, finalPunctuation: false });
    }
    return text;
  });
}

export function groupText(group, options = {}) {
  return displayLines(group, options).join('\n');
}
