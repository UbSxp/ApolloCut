/* ============================================================
   Testes da segmentação e do layout de linhas (pt-BR).
   Rode: npm run testes
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentWords, layoutLines, displayLines, SEGMENT_PRESETS, NO_START,
} from '../../src/captions/segment.js';
import { stripAccents } from '../../src/captions/normalize.js';

const CURTO = SEGMENT_PRESETS.curto;

/** Monta palavras com tempos: cada palavra dura `dur`, cada pausa `gap`. */
function palavras(frase, { dur = 0.3, gap = 0.05, pausas = {} } = {}) {
  let t = 0;
  return frase.split(/\s+/).filter(Boolean).map((text, i) => {
    const inicio = t;
    const fim = inicio + dur;
    t = fim + (pausas[i + 1] ?? gap);
    return { text, start: inicio, end: fim };
  });
}

function plain(word) {
  return stripAccents(word).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FRASES = [
  'almocei ontem e fui ao mercado comprar pão e leite',
  'não sei se eu vou conseguir terminar isso hoje',
  'o mercado estava cheio e a fila não andava',
  'ela me disse que ia chegar depois das oito da noite',
  'foram mil duzentos e noventa e nove reais em três parcelas',
  'a gente vai fazer isso amanhã tá ligado',
  'eu comprei pão leite café e açúcar no mercado da esquina',
];

test('nenhum bloco começa com palavra dependente', () => {
  for (const frase of FRASES) {
    const grupos = segmentWords(palavras(frase));
    grupos.slice(1).forEach((g) => {
      const primeira = plain(g.words[0].text);
      assert.ok(!NO_START.has(primeira), `"${frase}": bloco começa com "${g.words[0].text}"`);
    });
  }
});

test('nenhuma linha começa com palavra dependente', () => {
  for (const frase of FRASES) {
    for (const g of segmentWords(palavras(frase))) {
      g.lines.slice(1).forEach((linha) => {
        const primeira = plain(linha[0].text);
        assert.ok(!NO_START.has(primeira), `"${frase}": linha começa com "${linha[0].text}"`);
      });
    }
  }
});

test('respeita limites de palavras, linhas e caracteres', () => {
  for (const frase of FRASES) {
    for (const g of segmentWords(palavras(frase))) {
      assert.ok(g.words.length <= CURTO.maxWords, `bloco com ${g.words.length} palavras`);
      assert.ok(g.lines.length <= CURTO.maxLines, `bloco com ${g.lines.length} linhas`);
      for (const linha of g.lines) {
        const texto = linha.map((w) => w.text).join(' ');
        assert.ok(texto.length <= CURTO.maxChars, `linha longa (${texto.length}): "${texto}"`);
      }
    }
  }
});

test('pausa maior que 350 ms encerra o bloco', () => {
  // pausa de 0,6 s depois de "mercado"
  const pausas = { 6: 0.6 };
  const grupos = segmentWords(palavras(FRASES[0], { pausas }));
  const indice = grupos.findIndex((g) => g.words.some((w) => plain(w.text) === 'mercado'));
  assert.ok(indice >= 0, 'não achou "mercado"');
  const bloco = grupos[indice];
  assert.equal(plain(bloco.words[bloco.words.length - 1].text), 'mercado');
});

test('não deixa bloco de uma palavra no meio da fala', () => {
  for (const frase of FRASES) {
    const grupos = segmentWords(palavras(frase));
    grupos.slice(0, -1).forEach((g) => {
      assert.ok(g.words.length > 1, `bloco órfão: "${g.words.map((w) => w.text).join(' ')}"`);
    });
  }
});

test('linhas equilibradas: a menor tem ao menos metade da maior', () => {
  for (const frase of FRASES) {
    for (const g of segmentWords(palavras(frase))) {
      if (g.lines.length < 2) continue;
      const tam = g.lines.map((l) => l.map((w) => w.text).join(' ').length);
      assert.ok(Math.min(...tam) >= Math.max(...tam) / 2, `linhas desequilibradas: ${tam.join(' / ')}`);
    }
  }
});

test('esconde ponto e vírgula finais, mantém ? e !', () => {
  const g = (frase) => segmentWords(palavras(frase))[0];
  assert.equal(displayLines(g('chegou cedo.'))[0], 'Chegou cedo');
  assert.equal(displayLines(g('chegou cedo,'))[0], 'Chegou cedo');
  assert.equal(displayLines(g('chegou cedo?'))[0], 'Chegou cedo?');
  assert.equal(displayLines(g('chegou cedo!'))[0], 'Chegou cedo!');
});

test('tempos dos blocos são contínuos e crescentes', () => {
  for (const frase of FRASES) {
    const grupos = segmentWords(palavras(frase));
    for (let i = 1; i < grupos.length; i++) {
      assert.ok(grupos[i].start >= grupos[i - 1].end, `sobreposição entre blocos ${i - 1} e ${i}`);
    }
    for (const g of grupos) assert.ok(g.end > g.start);
  }
});

test('layoutLines não quebra artigo do substantivo', () => {
  const lista = palavras('o mercado da esquina estava cheio hoje cedo');
  const linhas = layoutLines(lista, { maxChars: 20 });
  assert.ok(linhas.length >= 2);
  linhas.slice(1).forEach((linha) => {
    assert.ok(!NO_START.has(plain(linha[0].text)), `linha começa com "${linha[0].text}"`);
  });
});
