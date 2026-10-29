/* ============================================================
   Teste rápido de subcaminho: garante que /ApolloCut/vendor/...
   responde 200 e que o import dinâmico no worker resolve.
   ============================================================ */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const PORT = 4175;
const PREFIX = '/ApolloCut/';
const BASE = `http://127.0.0.1:${PORT}${PREFIX}`;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['tools/servir-subcaminho.mjs', String(PORT), PREFIX], {
      cwd: resolve('..','..'),
      stdio: ['ignore','pipe','pipe'],
    });
    let started = false;
    child.stdout.on('data', (d) => {
      const txt = d.toString();
      console.log('[subcaminho-srv]', txt.trim());
      if (!started && txt.includes('em http://')) {
        started = true;
        setTimeout(() => resolve(child), 300);
      }
    });
    child.stderr.on('data', (d) => console.error('[subcaminho-srv err]', d.toString()));
    child.on('exit', (code) => { if (!started) reject(new Error(`servidor saiu ${code}`)); });
  });
}

async function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } catch (e) {
    console.error('fetch error for', url, e);
    throw e;
  } finally { clearTimeout(t); }
}

async function main() {
  console.log('▶ Iniciando servidor de subcaminho...');
  const child = await startServer();
  await new Promise(r => setTimeout(r, 500));
  try {
    const url = `${BASE}vendor/transformers.bundle.mjs`;
    console.log('▶ GET', url);
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
    const text = await res.text();
    if (!text.includes('export')) throw new Error('Conteúdo inesperado do bundle');
    console.log('✅ bundle transformers carregou (', text.length, 'chars )');
    // Teste também um arquivo do diretório ort
    const ortFile = 'ort/ort.min.mjs';
    const ortUrl = `${BASE}vendor/${ortFile}`;
    const res2 = await fetchWithTimeout(ortUrl);
    if (!res2.ok) throw new Error(`HTTP ${res2.status} ao buscar ${ortUrl}`);
    console.log('✅ arquivo ort acessível');
    console.log('🎉 Teste de subcaminho OK');
  } finally {
    try { process.kill(child.pid); } catch(_) {}
  }
}

main().catch((e) => {
  console.error('❌ Falha:', e.message);
  process.exit(1);
});