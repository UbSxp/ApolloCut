/* ============================================================
   Testes do texto: números, normalização, pós-processamento pt-BR,
   anti-alucinação, vocabulário e monotonicidade.
   Rode: npm run testes
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numberToWordsPt, wordsToNumberPt, normalizeForCompare, formatNumbersPt,
  postProcessPt,
} from '../../src/captions/normalize.js';
import { cleanWords, applyVocabulary, monotonic, skeleton } from '../../src/captions/words.js';

test('número por extenso em pt-BR', () => {
  assert.equal(numberToWordsPt(345), 'trezentos e quarenta e cinco');
  assert.equal(numberToWordsPt(1299), 'mil e duzentos e noventa e nove');
  assert.equal(numberToWordsPt(100), 'cem');
  assert.equal(numberToWordsPt(0), 'zero');
});

test('volta de palavras para número', () => {
  assert.equal(wordsToNumberPt('trezentos e quarenta e cinco'.split(' ')), 345);
  assert.equal(wordsToNumberPt('mil e duzentos e noventa e nove'.split(' ')), 1299);
  assert.equal(wordsToNumberPt('banana'.split(' ')), null);
});

test('comparação ignora acento, caixa, pontuação e "e" de número', () => {
  const a = normalizeForCompare('R$ 1.299,90').join(' ');
  const b = normalizeForCompare('mil duzentos e noventa e nove reais e noventa centavos').join(' ');
  assert.equal(a, b);
  assert.deepEqual(normalizeForCompare('Não, tudo bem!'), ['nao', 'tudo', 'bem']);
});

test('valor em reais vira R$ na exibição', () => {
  assert.equal(
    formatNumbersPt('trezentos e quarenta e cinco reais e vinte centavos'),
    'R$ 345,20',
  );
  assert.equal(formatNumbersPt('dia quinze de março'), 'dia 15 de março');
});

test('pós-processamento mantém gíria e corrige abreviação', () => {
  assert.equal(postProcessPt('vc vai la hj, ta ligado?', { numbers: false }), 'Você vai la hoje, ta ligado?');
  assert.equal(postProcessPt('eu to indo pra la agora', { numbers: false }), 'Eu to indo pra la agora.');
  assert.equal(postProcessPt('a reuniao foi otima', { numbers: false }), 'A reuniao foi otima.');
});

test('não inventa pontuação no meio, só no fim', () => {
  assert.equal(postProcessPt('chegou cedo', { numbers: false }), 'Chegou cedo.');
  assert.equal(postProcessPt('chegou cedo!', { numbers: false }), 'Chegou cedo!');
});

test('anti-alucinação remove frase fantasma das pontas', () => {
  const palavras = (texto) => texto.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const limpo = cleanWords(palavras('Legendas pela comunidade Amara.org isso é um teste'));
  assert.equal(limpo.map((w) => w.text).join(' '), 'isso é um teste');
  const fim = cleanWords(palavras('isso é um teste obrigado por assistir'));
  assert.equal(fim.map((w) => w.text).join(' '), 'isso é um teste');
});

test('anti-alucinação corta laço de repetição', () => {
  const palavras = 'não não não não sei'.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const limpo = cleanWords(palavras);
  assert.equal(limpo.filter((w) => w.text === 'não').length, 2);
});

test('vocabulário corrige nome próprio e termo composto', () => {
  const palavras = (texto) => texto.split(' ').map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const um = applyVocabulary(palavras('a no banquia subiu'), ['Nubank']);
  assert.equal(um.map((w) => w.text).join(' '), 'a Nubank subiu');

  const dois = applyVocabulary(palavras('o morrole foi bom'), ['mó role']);
  assert.equal(dois.map((w) => w.text).join(' '), 'o mó role foi bom');

  const intacto = applyVocabulary(palavras('nada a ver aqui'), ['Nubank']);
  assert.equal(intacto.map((w) => w.text).join(' '), 'nada a ver aqui');
});

test('vocabulário não engole palavra vizinha nem troca palavra comum', () => {
  const palavras = (texto) => texto.split(' ').map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  // "no Instagram": o "no" fica, o nome já está certo.
  const comPreposicao = applyVocabulary(palavras('postei no Instagram'), ['Instagram']);
  assert.equal(comPreposicao.map((w) => w.text).join(' '), 'postei no Instagram');

  // "para" e "PIX" têm esqueleto parecido (pr/px), mas não são o mesmo termo.
  const sigla = applyVocabulary(palavras('para emitir a nota'), ['PIX']);
  assert.equal(sigla.map((w) => w.text).join(' '), 'para emitir a nota');
  const corrigida = applyVocabulary(palavras('foi por PXI'), ['PIX']);
  assert.equal(corrigida.map((w) => w.text).join(' '), 'foi por PIX');
});

test('esqueleto consonantal aproxima grafias parecidas', () => {
  assert.equal(skeleton('Nubank'), skeleton('no banquia').slice(0, 1) + skeleton('nubank').slice(1));
  assert.equal(skeleton('PIX'), 'px');
});

test('monotonic ordena, não sobrepõe e corta fim invasor', () => {
  const entrada = [
    { text: 'b', start: 1.0, end: 3.0 },
    { text: 'a', start: 0.5, end: 1.1 },
    { text: 'c', start: 3.2, end: 3.2 },
  ];
  const saida = monotonic(entrada);
  assert.deepEqual(saida.map((w) => w.text), ['a', 'b', 'c']);
  for (let i = 1; i < saida.length; i++) {
    assert.ok(saida[i].start >= saida[i - 1].end, `sobreposição em ${saida[i].text}`);
  }
  assert.ok(saida.every((w) => w.end > w.start));
});

test('monotonic descarta tempo negativo', () => {
  const saida = monotonic([{ text: 'x', start: -2, end: -1 }]);
  assert.ok(saida[0].start >= 0);
});

test('monotonic não deixa a última palavra passar do fim do áudio', () => {
  const saida = monotonic([
    { text: 'a', start: 0, end: 1 },
    { text: 'b', start: 1, end: 49.98 },
  ], 35);
  assert.equal(saida[1].end, 35);
});

test('vírgula entre dígitos não vira pausa', () => {
  assert.equal(postProcessPt('o processo 105, 67 e 9', { numbers: false }), 'O processo 105,67 e 9.');
  assert.equal(postProcessPt('e o resto, tudo bem', { numbers: false }), 'E o resto, tudo bem.');
});
