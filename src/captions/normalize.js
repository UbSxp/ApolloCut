/* ============================================================
   APOLLOCUT — Normalização de texto pt-BR
   Módulo puro (sem DOM, sem rede). Usado pelo app, pelos testes
   e pelo harness de medição (tests/legendas/medir.mjs).
   ============================================================ */

const UNI = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Correções de fala informal que NUNCA devem aparecer como abreviação. */
export const ABREVIACOES = {
  vc: 'você', vcs: 'vocês', q: 'que', pq: 'porque', hj: 'hoje', td: 'tudo',
  tb: 'também', tbm: 'também', blz: 'beleza', msm: 'mesmo', qnd: 'quando',
  qto: 'quanto', agr: 'agora', dpois: 'depois', ñ: 'não', qro: 'quero',
};

/** Acentos ausentes em palavras sem ambiguidade. */
export const ACENTOS = {
  nao: 'não', tambem: 'também', voce: 'você', voces: 'vocês', ja: 'já',
  apos: 'após', tres: 'três', mes: 'mês', proximo: 'próximo', proxima: 'próxima',
  historia: 'história', negocio: 'negócio', video: 'vídeo', audios: 'áudios',
  esta: 'está', estao: 'estão', sao: 'são', entao: 'então', porem: 'porém',
  unico: 'único', unica: 'única', possivel: 'possível', facil: 'fácil',
  dificil: 'difícil', ultimo: 'último', ultima: 'última', agua: 'água',
};

/** Gírias que devem ser preservadas como o falante disse. */
export const GIRIAS = new Set(['pra', 'tá', 'tô', 'né', 'cê', 'mó', 'tipo', 'aí', 'demais']);

const NUM_WORDS = new Set([
  ...UNI, ...DEZ.filter(Boolean), ...CEM.filter(Boolean),
  'mil', 'milhão', 'milhões', 'milhao', 'milhoes', 'bilhão', 'bilhões',
]);

function below100(n) {
  if (n < 20) return UNI[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return DEZ[d] + (u ? ` e ${UNI[u]}` : '');
}

function below1000(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let out = c ? CEM[c] : '';
  if (r) out += (out ? ' e ' : '') + below100(r);
  return out;
}

/** 345 → "trezentos e quarenta e cinco" */
export function numberToWordsPt(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'zero';
  if (n >= 1e12) return String(n);
  const parts = [];
  const mi = Math.floor(n / 1e6);
  n %= 1e6;
  const mil = Math.floor(n / 1000);
  const un = n % 1000;
  if (mi) parts.push(mi === 1 ? 'um milhão' : `${numberToWordsPt(mi)} milhões`);
  if (mil) parts.push(mil === 1 ? 'mil' : `${below1000(mil)} mil`);
  if (un) parts.push(below1000(un));
  return parts.join(' e ');
}

/** ["trezentos","e","quarenta","e","cinco"] → 345 (null se não for número) */
export function wordsToNumberPt(words) {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const raw of words) {
    const w = String(raw).toLowerCase();
    if (w === 'e') continue;
    if (w === 'mil') {
      current = (current || 1) * 1000;
      total += current;
      current = 0;
      seen = true;
    } else if (w === 'milhão' || w === 'milhao') {
      current = (current || 1) * 1e6;
      total += current;
      current = 0;
      seen = true;
    } else if (w === 'milhões' || w === 'milhoes') {
      current = (current || 1) * 1e6;
      total += current;
      current = 0;
      seen = true;
    } else if (w === 'bilhão' || w === 'bilhao') {
      current = (current || 1) * 1e9;
      total += current;
      current = 0;
      seen = true;
    } else {
      const i = UNI.indexOf(w);
      const d = DEZ.indexOf(w);
      const c = CEM.indexOf(w);
      if (i >= 0) { current += i; seen = true; }
      else if (d > 1) { current += d * 10; seen = true; }
      else if (c > 0) { current += w === 'cem' ? 100 : c * 100; seen = true; }
      else return null;
    }
  }
  return seen ? total + current : null;
}

export function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function preprocessNumbers(text) {
  return String(text ?? '')
    // R$ 1.299,90 → "mil duzentos e noventa e nove reais e noventa centavos"
    .replace(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/gi, (_, int, cents) => {
      const n = Number(String(int).replace(/\./g, ''));
      let out = `${numberToWordsPt(n)} reais`;
      if (cents) out += ` e ${numberToWordsPt(Number(cents))} centavos`;
      return ` ${out} `;
    })
    // 15/03, 1.299, 12,5
    .replace(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/g, (_, int, dec) => {
      const n = Number(String(int).replace(/\./g, ''));
      let out = numberToWordsPt(n);
      if (dec) out += ` vírgula ${String(dec).split('').map((d) => UNI[Number(d)]).join(' ')}`;
      return ` ${out} `;
    })
    .replace(/%/g, ' por cento ')
    .replace(/\b(horas?)\s*:\s*(\d{2})\b/gi, '$1 e $2 minutos');
}

/**
 * Tokeniza para comparação (WER/CER): sem acento, sem pontuação,
 * números escritos por extenso e "e" de ligação numérica descartado.
 */
export function normalizeForCompare(text) {
  const raw = stripAccents(preprocessNumbers(text))
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  const tokens = raw.split(' ');
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // "catorze"/"quatorze" e "mil e duzentos"/"mil duzentos"
    if (t === 'e' && NUM_WORDS.has(out[out.length - 1]) && NUM_WORDS.has(tokens[i + 1])) continue;
    if (t === 'catorze') { out.push('quatorze'); continue; }
    if (t === 'porcento') { out.push('por', 'cento'); continue; }
    out.push(t);
  }
  return out;
}

export function normalizeForCer(text) {
  return normalizeForCompare(text).join(' ');
}

/** Formata valores para leitura humana (R$, datas, porcentagem). */
export function formatNumbersPt(text) {
  const NUM = `(?:${[...NUM_WORDS].join('|')})(?:\\s+e\\s+(?:${[...NUM_WORDS].join('|')}))*`;
  let out = String(text ?? '');

  out = out.replace(
    new RegExp(`\\b(${NUM})\\s+reais(?:\\s+e\\s+(${NUM})\\s+centavos)?`, 'gi'),
    (match, reais, cents) => {
      const r = wordsToNumberPt(reais.split(/\s+/));
      if (r == null) return match;
      const c = cents ? wordsToNumberPt(cents.split(/\s+/)) : null;
      const reaisFmt = r.toLocaleString('pt-BR');
      if (c == null) return `R$ ${reaisFmt}`;
      return `R$ ${reaisFmt},${String(c).padStart(2, '0')}`;
    },
  );

  out = out.replace(
    new RegExp(`\\bdia\\s+(${NUM})\\s+de\\s+(${MONTHS.join('|')})`, 'gi'),
    (match, dia, mes) => {
      const d = wordsToNumberPt(dia.split(/\s+/));
      return d == null ? match : `dia ${d} de ${mes.toLowerCase()}`;
    },
  );

  out = out.replace(
    new RegExp(`\\b(${NUM})\\s+por\\s+cento`, 'gi'),
    (match, valor) => {
      const v = wordsToNumberPt(valor.split(/\s+/));
      return v == null ? match : `${v}%`;
    },
  );

  return out;
}

/** Pós-processamento de exibição: pontuação, maiúsculas, acentos, abreviações. */
export function postProcessPt(text, options = {}) {
  const { numbers = true } = options;
  let out = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!out) return '';

  if (numbers) out = formatNumbersPt(out);

  out = out
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(?=\S)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  out = out.replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
    const plain = stripAccents(word).toLowerCase();
    const lower = word.toLowerCase();
    if (ABREVIACOES[lower]) return ABREVIACOES[lower];
    if (ACENTOS[lower] && !GIRIAS.has(lower)) {
      // Preserva capitalização de nomes próprios.
      const fix = ACENTOS[lower];
      return /^[A-ZÀ-Ý]/.test(word) ? fix[0].toUpperCase() + fix.slice(1) : fix;
    }
    return word;
  });

  // Maiúscula no início e depois de . ? !
  out = out.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (m, pre, ch) => pre + ch.toUpperCase());

  if (!/[.!?…]$/.test(out)) out += '.';
  return out;
}

export const __internals = { NUM_WORDS, below100, below1000, preprocessNumbers };
