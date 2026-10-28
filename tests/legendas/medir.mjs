#!/usr/bin/env node
/* ============================================================
   APOLLOCUT — medir.mjs
   Roda a transcrição real do app (Playwright + navegador) em cada
   clipe de tests/legendas/clipes e calcula WER, CER, erro de tempo
   por palavra, alucinações em silêncio, palavras perdidas e custo.

   Uso:
     node tests/legendas/medir.mjs                  # modelo padrão do app
     node tests/legendas/medir.mjs --model tiny
     node tests/legendas/medir.mjs --label antes --only 01,11
     node tests/legendas/medir.mjs --out docs/legendas/baseline.md
   ============================================================ */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { normalizeForCompare, normalizeForCer } from '../../src/captions/normalize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CLIPES = path.join(HERE, 'clipes');
const BASE = 'http://127.0.0.1:4173';

const MODELS = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

/* ---------------- métricas ---------------- */

function align(ref, hyp) {
  const n = ref.length;
  const m = hyp.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      ops.push({ type: ref[i - 1] === hyp[j - 1] ? 'match' : 'sub', r: i - 1, h: j - 1 });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'del', r: i - 1 });
      i--;
    } else {
      ops.push({ type: 'ins', h: j - 1 });
      j--;
    }
  }
  ops.reverse();
  let sub = 0;
  let del = 0;
  let ins = 0;
  for (const op of ops) {
    if (op.type === 'sub') sub++;
    else if (op.type === 'del') del++;
    else if (op.type === 'ins') ins++;
  }
  return { ops, sub, del, ins, dist: dp[n][m] };
}

function pct(part, total) {
  return total ? (part / total) * 100 : 0;
}

function wordKeys(words) {
  return words.map((w) => normalizeForCompare(w.text).join(' ') || String(w.text || '').toLowerCase());
}

function metricas(ref, hypWords, procMs) {
  const refTokens = normalizeForCompare(ref.display);
  const hypTokens = normalizeForCompare(hypWords.map((w) => w.text).join(' '));

  const words = align(refTokens, hypTokens);
  const refChars = [...normalizeForCer(ref.display).replace(/\s/g, '')];
  const hypChars = [...normalizeForCer(hypWords.map((w) => w.text).join(' ')).replace(/\s/g, '')];
  const chars = align(refChars, hypChars);

  const refKeys = wordKeys(ref.words || []);
  const hypKeys = wordKeys(hypWords);
  const timing = align(refKeys, hypKeys);
  const errors = [];
  const pares = [];
  for (const op of timing.ops) {
    if (op.type !== 'match') continue;
    const refWord = ref.words[op.r];
    const hypWord = hypWords[op.h];
    if (!refWord || !hypWord) continue;
    if (!Number.isFinite(hypWord.start)) continue;
    const err = Math.abs(hypWord.start * 1000 - refWord.startMs);
    errors.push(err);
    pares.push({ text: hypWord.text, ref: refWord.startMs, hyp: Math.round(hypWord.start * 1000), err: Math.round(err) });
  }
  errors.sort((a, b) => a - b);
  const mean = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
  const p95 = errors.length ? errors[Math.min(errors.length - 1, Math.floor(errors.length * 0.95))] : null;

  const janelas = (ref.silence || []).filter((s) => s.end - s.start >= 0.4);
  const alucinadas = hypWords.filter((w) => {
    const t = Number(w.start);
    return janelas.some((s) => t > s.start + 0.25 && t < s.end - 0.25);
  });

  return {
    wer: pct(words.dist, refTokens.length),
    cer: pct(chars.dist, refChars.length),
    substituicoes: words.sub,
    perdidas: words.del,
    inventadas: words.ins,
    alucinacoes: alucinadas.length,
    alucinacoesTexto: alucinadas.map((w) => w.text).join(' '),
    tempoMedioMs: mean,
    tempoP95Ms: p95,
    palavrasComparadas: errors.length,
    pares,
    refTokens: refTokens.length,
    refChars: refChars.length,
    distChars: chars.dist,
    distTokens: words.dist,
    hypTokens: hypTokens.length,
    msPorMinuto: ref.durationMs ? procMs / (ref.durationMs / 60000) : null,
    procMs,
    texto: hypWords.map((w) => w.text).join(' '),
  };
}

/* ---------------- navegador ---------------- */

async function garantirServidor() {
  try {
    const res = await fetch(`${BASE}/index.html`, { method: 'HEAD' });
    if (res.ok) return null;
  } catch (_) { /* sobe abaixo */ }
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [path.join(ROOT, 'tools/servir.mjs'), '4173'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`${BASE}/index.html`, { method: 'HEAD' });
      if (res.ok) return child;
    } catch (_) { /* ainda subindo */ }
  }
  throw new Error('Servidor não respondeu em http://127.0.0.1:4173');
}

async function abrir() {
  const perfil = path.join(ROOT, '.cache', 'medir-perfil');
  await fs.mkdir(perfil, { recursive: true });
  const ctx = await chromium.launchPersistentContext(perfil, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('   [browser]', msg.text().slice(0, 200));
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__APOLLO_DEBUG__, null, { timeout: 60000 });
  return { ctx, page };
}

async function carregarClipe(page, id) {
  await page.evaluate(async (clipId) => {
    const res = await fetch(`/tests/legendas/clipes/${clipId}.mp4`);
    if (!res.ok) throw new Error(`fetch ${clipId}: ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], `${clipId}.mp4`, { type: 'video/mp4' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector('#fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
  await page.waitForFunction(
    () => {
      const s = window.__APOLLO_DEBUG__.state;
      return !!s.url && Number(s.duration) > 0;
    },
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    const s = window.__APOLLO_DEBUG__.state;
    s.cues = [];
    s.cueSource = 'vazio';
    const sel = document.querySelector('#langSelect');
    if (sel) sel.value = 'pt';
  });
}

async function transcrever(page, timeoutMs) {
  await page.evaluate(() => {
    window.__MEDIR__ = { result: null, erro: null };
    window.addEventListener('whisper:result', (e) => { window.__MEDIR__.result = e.detail; }, { once: true });
    window.__APOLLO_DEBUG__.whisper.startWhisper();
  });
  await page.waitForFunction(
    () => window.__MEDIR__ && (window.__MEDIR__.result || !window.__APOLLO_DEBUG__.state.capture.running),
    null,
    { timeout: timeoutMs },
  );
  return page.evaluate(() => {
    const m = window.__MEDIR__;
    if (m.result) {
      const groups = m.result.groups || [];
      return {
        ok: true,
        model: window.__APOLLO_DEBUG__.state.whisper.model,
        ms: window.__APOLLO_DEBUG__.state.whisper.lastMs,
        words: groups.flatMap((g) => g.words || []).map((w) => ({
          text: w.text,
          start: Number(w.start),
          end: Number(w.end),
          confidence: w.confidence ?? null,
        })),
        debug: m.result.debug || null,
      };
    }
    return { ok: false, erro: document.querySelector('#whisperLog')?.textContent?.slice(-400) || 'falhou' };
  });
}

/* ---------------- relatório ---------------- */

function tabela(linhas) {
  const head = '| clipe | WER | CER | erro médio | p95 | alucinações | perdidas | ms/min |\n|---|---:|---:|---:|---:|---:|---:|---:|';
  const body = linhas.map((l) => `| ${l.id} | ${l.wer.toFixed(1)}% | ${l.cer.toFixed(1)}% | ${fmt(l.tempoMedioMs, 'ms')} | ${fmt(l.tempoP95Ms, 'ms')} | ${l.alucinacoes} | ${l.perdidas} | ${Math.round(l.msPorMinuto || 0)} |`).join('\n');
  return `${head}\n${body}`;
}

function fmt(v, unit) {
  return v == null ? '—' : `${Math.round(v)} ${unit}`;
}

function resumo(linhas) {
  const totalRef = linhas.reduce((a, l) => a + l.refTokens, 0);
  const totalDist = linhas.reduce((a, l) => a + (l.distTokens || 0), 0);
  const totalChars = linhas.reduce((a, l) => a + (l.refChars || 0), 0);
  const comTempo = linhas.filter((l) => l.tempoMedioMs != null);
  // Erro de tempo agregado sobre todas as palavras — não a média das médias
  // nem o pior clipe (um token de número fundido distorce o p95 de um clipe).
  const erros = comTempo
    .flatMap((l) => (l.pares || []).map((p) => p.err))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  return {
    wer: totalRef ? (totalDist / totalRef) * 100 : 0,
    cer: totalChars ? (linhas.reduce((a, l) => a + (l.distChars || 0), 0) / totalChars) * 100 : 0,
    tempoMedioMs: erros.length ? erros.reduce((a, b) => a + b, 0) / erros.length : null,
    tempoP95Ms: erros.length ? erros[Math.min(erros.length - 1, Math.floor(erros.length * 0.95))] : null,
    alucinacoes: linhas.reduce((a, l) => a + l.alucinacoes, 0),
    perdidas: linhas.reduce((a, l) => a + l.perdidas, 0),
    msPorMinuto: linhas.reduce((a, l) => a + (l.msPorMinuto || 0), 0) / Math.max(1, linhas.length),
  };
}

async function main() {
  const modelArg = arg('model');
  const label = arg('label', 'execucao');
  const only = arg('only');
  const outPath = arg('out');
  const limite = Number(arg('timeout', 900000));

  const arquivos = (await fs.readdir(CLIPES)).filter((f) => f.endsWith('.json')).sort();
  const filtro = only ? String(only).split(',') : null;
  const refs = [];
  for (const f of arquivos) {
    const ref = JSON.parse(await fs.readFile(path.join(CLIPES, f), 'utf8'));
    if (!filtro || filtro.some((p) => ref.id.startsWith(p))) refs.push(ref);
  }
  if (!refs.length) throw new Error('Nenhum clipe selecionado.');

  const servidor = await garantirServidor();
  const { ctx, page } = await abrir();
  if (modelArg && modelArg !== true) {
    await page.evaluate((m) => { window.__APOLLO_DEBUG__.state.whisper.requestedModel = m; }, MODELS[modelArg] || modelArg);
  }
  const modeloUsado = await page.evaluate(() => window.__APOLLO_DEBUG__.state.whisper.requestedModel || null);
  const vocab = arg('vocab');
  if (vocab && vocab !== true) {
    await page.evaluate((v) => {
      const el = document.querySelector('#hardWordsInput');
      if (el) el.value = v;
    }, vocab);
  }

  const linhas = [];
  try {
    for (const ref of refs) {
      process.stdout.write(`→ ${ref.id} ... `);
      await carregarClipe(page, ref.id);
      const t = await transcrever(page, limite);
      if (!t.ok) {
        console.log('FALHOU');
        console.log(t.erro);
        linhas.push({ id: ref.id, wer: 100, cer: 100, tempoMedioMs: null, tempoP95Ms: null, alucinacoes: 0, perdidas: ref.words.length, msPorMinuto: 0, refTokens: ref.words.length, texto: '', erro: t.erro });
        continue;
      }
      const m = metricas(ref, t.words, t.ms || 0);
      m.id = ref.id;
      m.modelo = t.model;
      linhas.push(m);
      if (t.debug) m.debug = t.debug;
      if (arg('dump') && t.debug) {
        console.log('   regiões:', t.debug.regioes.map((r) => `${r.start.toFixed(2)}-${r.end.toFixed(2)}`).join(' '));
        console.log('   bruto :', t.debug.brutas.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(' '));
        console.log('   final :', t.words.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(' '));
      }
      console.log(`WER ${m.wer.toFixed(1)}% · tempo ${fmt(m.tempoMedioMs, 'ms')} · aluc ${m.alucinacoes} · ${Math.round(m.msPorMinuto)} ms/min`);
      if (process.env.MEDIR_VERBOSE) console.log('   hyp:', m.texto);
      if (arg('dump')) {
        const piores = [...m.pares].sort((a, b) => b.err - a.err).slice(0, 6);
        for (const p of piores) {
          console.log(`   ${String(p.text).slice(0, 16).padEnd(17)} ref ${p.ref}ms · hyp ${p.hyp}ms · erro ${p.err}ms`);
        }
      }
    }
  } finally {
    await ctx.close();
    if (servidor) servidor.kill();
  }

  const r = resumo(linhas);
  const data = new Date().toISOString();
  const relatorio = {
    label,
    data,
    modelo: modeloUsado || linhas[0]?.modelo || 'padrão',
    resumo: r,
    clipes: linhas,
  };

  await fs.mkdir(path.join(HERE, 'resultados'), { recursive: true });
  const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`;
  await fs.writeFile(path.join(HERE, 'resultados', nome), JSON.stringify(relatorio, null, 2), 'utf8');

  const md = [
    `## ${label} — ${data.slice(0, 16).replace('T', ' ')}`,
    '',
    `Modelo: \`${relatorio.modelo}\``,
    '',
    tabela(linhas),
    '',
    `**Resumo:** WER ${r.wer.toFixed(1)}% · CER ${r.cer.toFixed(1)}% · erro médio de tempo ${fmt(r.tempoMedioMs, 'ms')} · p95 ${fmt(r.tempoP95Ms, 'ms')} · alucinações ${r.alucinacoes} · palavras perdidas ${r.perdidas} · ${Math.round(r.msPorMinuto)} ms por minuto de áudio`,
    '',
  ].join('\n');

  if (outPath && outPath !== true) {
    const alvo = path.resolve(ROOT, String(outPath));
    await fs.mkdir(path.dirname(alvo), { recursive: true });
    await fs.writeFile(alvo, `# Linha de base — legendas\n\n${md}`, 'utf8');
  }
  console.log(`\n${md}`);
  console.log(`JSON: tests/legendas/resultados/${nome}`);
  if (r.wer > 100) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
