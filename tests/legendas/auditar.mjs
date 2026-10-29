#!/usr/bin/env node
/* ============================================================
   APOLLOCUT — auditar.mjs
   Roda medir.mjs e valida os thresholds de qualidade das legendas.
   Falha se qualquer métrica piorar além do limite.
   ============================================================ */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RESULTADOS = path.join(HERE, 'resultados');

/* Limites (não piorar que a linha de base) */
const LIMITES = {
  werMax: 10,           // WER global ≤ 10%
  cerMax: 5,            // CER global ≤ 5%
  tempoMedioMax: 100,   // erro médio ≤ 100 ms
  tempoP95Max: 200,     // p95 ≤ 200 ms
  alucinacoesMax: 0,    // alucinações em silêncio = 0
  perdidasMax: 5,       // palavras perdidas ≤ 5 por clipe
};

async function runMedir(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HERE, 'medir.mjs'), ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`medir.mjs saiu com código ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout);
      }
    });
    child.on('error', reject);
  });
}

async function getLatestResult() {
  const files = await fs.readdir(RESULTADOS).catch(() => []);
  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse();
  if (!jsonFiles.length) throw new Error('Nenhum resultado em tests/legendas/resultados/');
  const content = await fs.readFile(path.join(RESULTADOS, jsonFiles[0]), 'utf8');
  return JSON.parse(content);
}

function checkLimites(resumo) {
  const falhas = [];
  if (resumo.werGlobal > LIMITES.werMax) {
    falhas.push(`WER global ${resumo.werGlobal.toFixed(1)}% > ${LIMITES.werMax}%`);
  }
  if (resumo.cerGlobal > LIMITES.cerMax) {
    falhas.push(`CER global ${resumo.cerGlobal.toFixed(1)}% > ${LIMITES.cerMax}%`);
  }
  if (resumo.tempoMedioMs > LIMITES.tempoMedioMax) {
    falhas.push(`Erro médio ${resumo.tempoMedioMs} ms > ${LIMITES.tempoMedioMax} ms`);
  }
  if (resumo.tempoP95Ms > LIMITES.tempoP95Max) {
    falhas.push(`p95 ${resumo.tempoP95Ms} ms > ${LIMITES.tempoP95Max} ms`);
  }
  if (resumo.alucinacoesTotal > LIMITES.alucinacoesMax) {
    falhas.push(`Alucinações ${resumo.alucinacoesTotal} > ${LIMITES.alucinacoesMax}`);
  }
  if (resumo.perdidasMaxPorClip > LIMITES.perdidasMax) {
    falhas.push(`Perdidas máx/clip ${resumo.perdidasMaxPorClip} > ${LIMITES.perdidasMax}`);
  }
  return falhas;
}

async function main() {
  console.log('🔍 Auditoria de qualidade das legendas…');
  console.log('');

  // Roda medir.mjs com modelo padrão do app (base)
  await runMedir(['--label', 'auditoria']);
  console.log('');

  const resultado = await getLatestResult();
  const resumo = resultado.resumo;

  console.log('📊 Resumo da medição:');
  console.log(`  WER global: ${resumo.wer.toFixed(1)}%`);
  console.log(`  CER global: ${resumo.cer.toFixed(1)}%`);
  console.log(`  Erro médio: ${resumo.tempoMedioMs} ms`);
  console.log(`  p95: ${resumo.tempoP95Ms} ms`);
  console.log(`  Alucinações: ${resumo.alucinacoes}`);
  console.log(`  Perdidas total: ${resumo.perdidas}`);
  console.log(`  Palavras/min: ${Math.round(resumo.msPorMinuto)} ms/min`);
  console.log('');

  // Calcula perdidas máx por clipe
  const perdidasMaxPorClip = Math.max(...resultado.clipes.map(c => c.perdidas || 0));
  const checkResumo = {
    ...resumo,
    werGlobal: resumo.wer,
    cerGlobal: resumo.cer,
    alucinacoesTotal: resumo.alucinacoes,
    perdidasMaxPorClip,
  };

  const falhas = checkLimites(checkResumo);
  if (falhas.length) {
    console.log('❌ FALHOU — limites excedidos:');
    for (const f of falhas) console.log(`  - ${f}`);
    process.exit(1);
  } else {
    console.log('✅ APROVADO — todos os limites dentro do esperado.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('❌ Erro na auditoria:', err.message);
  process.exit(1);
});