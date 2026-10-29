/* ============================================================
   APOLLOCUT — Teste de ponta a ponta (Playwright)
   6 verificações obrigatórias + cenários de borda.
   Uso: npm run teste   (ou TESTAR.bat)
   Evidências: docs/evidencias/
   ============================================================ */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ffprobe from 'ffprobe-static';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const EVID = join(ROOT, 'docs', 'evidencias');
const FIX = join(ROOT, 'tests', 'fixtures');
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

mkdirSync(EVID, { recursive: true });

const results = [];
let browser;
let context;
let page;
let server;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'APROVADO' : 'REPROVADO'} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function shot(name) {
  try {
    await page.screenshot({ path: join(EVID, `${name}.png`), fullPage: false });
  } catch (_) { /* screenshot é evidência, não requisito */ }
}

async function startServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return;
  } catch (_) { /* sobe abaixo */ }
  server = spawn(process.execPath, [join(ROOT, 'tools', 'servir.mjs'), String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch (_) { /* ainda subindo */ }
  }
  throw new Error('servidor não subiu');
}

async function openApp() {
  await page.goto(`${BASE}/?e2e=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const skip = page.locator('#openingSkip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(700);
}

async function loadFixture(name) {
  await page.evaluate(async (fixture) => {
    const res = await fetch(`/tests/fixtures/${fixture}`);
    const blob = await res.blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], fixture, { type: blob.type || 'video/mp4' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, name);
  await page.waitForFunction(() => {
    const v = document.getElementById('previewVideo');
    return v && v.readyState >= 1 && v.duration > 0;
  }, { timeout: 20000 });
}

async function waitAnalysis() {
  await page.waitForFunction(() => {
    const pct = document.getElementById('analysisPct')?.textContent || '0%';
    return parseInt(pct, 10) >= 100;
  }, { timeout: 120000 });
  await page.waitForTimeout(400);
}

function probe(file) {
  return new Promise((resolvePromise) => {
    const child = spawn(ffprobe.path, ['-v', 'error', '-count_packets', '-print_format', 'json', '-show_format', '-show_streams', file]);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      try { resolvePromise(JSON.parse(out)); } catch (_) { resolvePromise(null); }
    });
    child.on('error', () => resolvePromise(null));
  });
}

async function run() {
  await startServer();
  browser = await chromium.launch();
  context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 960 } });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // ---------- 1. Isolamento de origem ----------
  await openApp();
  const isolation = await page.evaluate(() => ({
    coi: self.crossOriginIsolated,
    sab: typeof SharedArrayBuffer,
    health: window.__APOLLO_HEALTH__?.(),
  }));
  const headers = await (await fetch(`${BASE}/index.html`)).headers;
  check(
    '1. Servidor com COOP/COEP e crossOriginIsolated',
    isolation.coi === true && isolation.sab === 'function' && headers.get('cross-origin-opener-policy') === 'same-origin',
    `coi=${isolation.coi} sab=${isolation.sab} coop=${headers.get('cross-origin-opener-policy')}`
  );
  await shot('01-isolamento');

  // ---------- 2. Tema ----------
  await openApp();
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.js-theme');
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  await shot('02-tema-1');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  const themeReload = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    pressed: document.querySelector('.js-theme')?.getAttribute('aria-pressed'),
    meta: document.querySelector('meta[name="theme-color"]')?.content,
  }));
  check(
    '2. Tema alterna e persiste após recarregar',
    themeBefore !== themeAfter && themeReload.theme === themeAfter && themeReload.pressed === String(themeAfter === 'dark'),
    `${themeBefore} → ${themeAfter} → ${themeReload.theme}`
  );
  await shot('02-tema-2');

  // ---------- 3. Processamento ----------
  await openApp();
  await loadFixture('fala-ptbr.mp4');
  const enabled = await page.evaluate(() => ({
    analyze: !document.getElementById('analyzeBtn').disabled,
    whisper: !document.getElementById('whisperBtn').disabled,
    duration: document.getElementById('previewVideo').duration,
  }));
  await page.click('#analyzeBtn');
  await waitAnalysis();
  // As miniaturas são geradas em série depois da análise.
  await page.waitForFunction(() => {
    const clips = window.__APOLLO_DEBUG__.state.clips.length;
    return clips > 0 && document.querySelectorAll('#clipGrid .clip-thumb img').length === clips;
  }, { timeout: 30000 }).catch(() => {});
  const analysis = await page.evaluate(() => ({
    pct: document.getElementById('analysisPct').textContent,
    clips: window.__APOLLO_DEBUG__.state.clips.length,
    cards: document.querySelectorAll('#clipGrid .clip-card').length,
    thumbs: document.querySelectorAll('#clipGrid .clip-thumb img').length,
  }));
  check(
    '3. Vídeo carrega, análise chega a 100% e gera cortes',
    enabled.analyze && enabled.whisper && analysis.pct === '100%' && analysis.clips > 0 && analysis.cards === analysis.clips,
    `${analysis.clips} cortes, ${analysis.thumbs} miniaturas`
  );
  await shot('03-processamento');

  // ---------- 4. Edição + exportação ----------
  await page.evaluate(() => {
    const v = document.getElementById('previewVideo');
    v.currentTime = 1;
  });
  await page.waitForTimeout(300);
  await page.click('#markInBtn');
  await page.evaluate(() => { document.getElementById('previewVideo').currentTime = 4; });
  await page.waitForTimeout(300);
  await page.click('#markOutBtn');
  await page.click('#addClipBtn');
  const manual = await page.evaluate(() => window.__APOLLO_DEBUG__.state.getActiveClip());
  await page.click('#ratioGrid [data-ratio="9:16"]');
  await page.evaluate(() => {
    const active = window.__APOLLO_DEBUG__.state.getActiveClip();
    document.getElementById('exportBtn').click();
    return active?.id;
  });
  await page.waitForTimeout(300);
  await page.click('#exportStart');
  // O app não baixa sozinho: espera o resultado e clica no link. O arquivo é
  // gravado pelo servidor local (/salvar) — o download do navegador embutido
  // falha acima de ~5 MB e o corte passa disso.
  await page.waitForSelector('#exportResult:not([hidden])', { timeout: 90000 });
  await page.click('#downloadLink');
  await page.waitForFunction(
    () => window.__APOLLO_DEBUG__.state.export.savedPath,
    null,
    { timeout: 60000 },
  );
  const salvo = await page.evaluate(() => window.__APOLLO_DEBUG__.state.export.savedPath);
  const outFile = join(EVID, 'corte-exportado.mp4');
  copyFileSync(salvo, outFile);
  try { unlinkSync(salvo); } catch (_) { /* arquivo já removido */ }
  await page.waitForTimeout(500);
  await shot('04-exportacao');

  const info = await probe(outFile);
  const videoStream = info?.streams?.find((s) => s.codec_type === 'video');
  const isMp4 = /mp4/.test(info?.format?.format_name || '');
  const frames = Number(videoStream?.nb_read_packets || 0);
  const appDuration = await page.evaluate(() => Number(document.getElementById('downloadLink').getAttribute('data-duration')));
  check(
    '4. Corte 1s–4s exporta MP4 H.264 válido (9:16, ~3s)',
    !!videoStream && isMp4 && videoStream.codec_name === 'h264' && videoStream.width === 720 && videoStream.height === 1280 && frames >= 60 && Math.abs(appDuration - 3) <= 0.6,
    `${videoStream?.width}x${videoStream?.height} ${videoStream?.codec_name} ${frames} quadros ${appDuration}s`
  );

  // ---------- 5. Transcrição ----------
  await page.click('#exportClose');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__APOLLO_DEBUG__.state.clips = [];
    window.__APOLLO_DEBUG__.state.activeId = null;
    document.querySelector('#clipsSection').hidden = true;
    document.getElementById('whisperBtn').click();
  });
  await page.waitForTimeout(300);
  await page.click('#whisperStart');
  await page.waitForFunction(() => {
    const log = document.getElementById('whisperLog')?.textContent || '';
    return /Pronto:|Erro:|Falhou/.test(log);
  }, null, { timeout: 300000 });
  await page.waitForTimeout(800);
  const whisper = await page.evaluate(() => ({
    cues: window.__APOLLO_DEBUG__.state.cues,
    log: document.getElementById('whisperLog').textContent,
    model: window.__APOLLO_DEBUG__.state.whisper.model,
  }));
  const text = (whisper.cues || []).map((c) => c.text).join(' ').toLowerCase();
  const keywords = ['mercado', 'pão', 'leite', 'vizinho', 'filme'];
  const hits = keywords.filter((k) => text.includes(k));
  const ordered = (whisper.cues || []).every((c, i, arr) => c.end > c.start && (i === 0 || c.start >= arr[i - 1].start));
  writeFileSync(join(EVID, 'transcricao.json'), JSON.stringify(whisper, null, 2), 'utf8');
  check(
    '5. Whisper transcreve a fala e os tempos são válidos',
    hits.length >= 3 && ordered && whisper.cues.length > 0,
    `${hits.length}/${keywords.length} palavras-chave, ${whisper.cues.length} blocos, modelo ${whisper.model || '?'}`
  );
  await shot('05-transcricao');

  // ---------- 6. Legendas SRT/ASS ----------
  await page.click('.console-tab[data-tab="captions"]');
  await page.waitForTimeout(200);
  const srtPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#exportSrtBtn');
  const srtDl = await srtPromise;
  const srtPath = join(EVID, 'legendas.srt');
  await srtDl.saveAs(srtPath);
  const assPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#exportAssBtn');
  const assDl = await assPromise;
  const assPath = join(EVID, 'legendas.ass');
  await assDl.saveAs(assPath);

  const srt = readFileSync(srtPath, 'utf8');
  const ass = readFileSync(assPath, 'utf8');
  const srtOk = /^\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n.+/m.test(srt);
  const assOk = ass.includes('[Script Info]') && ass.includes('[V4+ Styles]') && ass.includes('[Events]') && /Dialogue: 0,\d+:\d{2}:\d{2}\.\d{2},/.test(ass);
  check(
    '6. Legendas exportam em SRT e ASS válidos',
    srtOk && assOk && srt.length > 20 && ass.length > 100,
    `srt=${srt.length}B ass=${ass.length}B`
  );

  // ---------- Diagnóstico ----------
  await page.click('#diagnosticsBtn');
  await page.waitForTimeout(300);
  const diag = await page.evaluate(() => document.getElementById('diagnosticsOut').textContent);
  writeFileSync(join(EVID, 'diagnostico.json'), diag, 'utf8');
  check('7. Painel de diagnóstico abre e mostra o ambiente', diag.includes('crossOriginIsolated') && diag.includes('whisperModel'));
  await shot('07-diagnostico');

  // ---------- Cenários de borda ----------
  console.log('\n— Cenários de borda —');

  // Vídeo sem áudio: transcrição deve falhar com mensagem clara, sem travar.
  await openApp();
  await loadFixture('mudo.mp4');
  await page.evaluate(() => document.getElementById('whisperBtn').click());
  await page.waitForTimeout(200);
  await page.click('#whisperStart');
  await page.waitForFunction(() => /Erro:|Falhou/.test(document.getElementById('whisperLog')?.textContent || ''), null, { timeout: 60000 });
  const muteMsg = await page.evaluate(() => document.getElementById('whisperLog').textContent);
  check('B1. Vídeo sem áudio falha com mensagem clara', /mudo|inaudível|sem áudio|não tem áudio/i.test(muteMsg), muteMsg.split('\n').pop().slice(0, 90));
  await page.evaluate(() => window.__APOLLO_DEBUG__.whisper.overlays.close(document.getElementById('whisperOverlay')));

  // Arquivo corrompido: erro tratado, sem travar.
  await openApp();
  await page.evaluate(async () => {
    const res = await fetch('/tests/fixtures/corrompido.mp4');
    const dt = new DataTransfer();
    dt.items.add(new File([await res.blob()], 'corrompido.mp4', { type: 'video/mp4' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(3000);
  const corrupt = await page.evaluate(() => ({
    toast: document.getElementById('toasts').textContent,
    analyzeDisabled: document.getElementById('analyzeBtn').disabled,
  }));
  check('B2. Arquivo corrompido é recusado sem travar', /erro|vídeo|carregar/i.test(corrupt.toast) && corrupt.analyzeDisabled === true);

  // Cancelar no meio da análise.
  await openApp();
  await loadFixture('fala-ptbr.mp4');
  // Dispara e cancela no mesmo tique: o cancelamento é o que está sob teste.
  await page.evaluate(() => {
    document.getElementById('analyzeBtn').click();
    document.getElementById('analysisCancelBtn').click();
  });
  await page.waitForTimeout(900);
  const cancelled = await page.evaluate(() => ({
    running: window.__APOLLO_DEBUG__.state.analysis.running,
    overlay: document.getElementById('analysisOverlay').hidden,
  }));
  // Reanalisar prova que o cancelamento não deixou a interface travada.
  await page.click('#analyzeBtn');
  await waitAnalysis();
  const recovered = await page.evaluate(() => window.__APOLLO_DEBUG__.state.clips.length);
  check(
    'B3. Cancelar no meio da análise não trava e permite reanalisar',
    cancelled.running === false && cancelled.overlay === true && recovered > 0,
    `running=${cancelled.running} overlayFechado=${cancelled.overlay} cortes=${recovered}`
  );

  // Trocar de tema durante o processamento.
  // O overlay de análise é modal, então o caminho real é o controller
  // (mesmo handler do botão): o que se verifica é que a troca não quebra a análise.
  await openApp();
  await loadFixture('fala-ptbr.mp4');
  await page.click('#analyzeBtn');
  await page.waitForTimeout(300);
  const themeMidBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  const themeMidAfter = await page.evaluate(() => {
    window.__APOLLO_DEBUG__.theme.toggle();
    return document.documentElement.dataset.theme;
  });
  await waitAnalysis();
  const afterTheme = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    clips: window.__APOLLO_DEBUG__.state.clips.length,
  }));
  check(
    'B4. Trocar o tema durante o processamento funciona',
    themeMidBefore !== themeMidAfter && afterTheme.theme === themeMidAfter && afterTheme.clips > 0,
    `${themeMidBefore} → ${themeMidAfter}, ${afterTheme.clips} cortes`
  );

  // Recarregar no meio da análise.
  await openApp();
  await loadFixture('fala-ptbr.mp4');
  await page.click('#analyzeBtn');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const reloaded = await page.evaluate(() => ({
    app: !!window.__APOLLO_DEBUG__,
    theme: document.documentElement.dataset.theme,
  }));
  check('B5. Recarregar no meio de uma operação volta são', reloaded.app === true);

  // Vídeo de 5 minutos (fixture própria, com duração no cabeçalho).
  try {
    await openApp();
    await loadFixture('longo-5min.mp4');
    const dur = await page.evaluate(() => document.getElementById('previewVideo').duration);
    await page.click('#analyzeBtn');
    await waitAnalysis();
    const longOk = await page.evaluate(() => window.__APOLLO_DEBUG__.state.clips.length > 0);
    check(
      'B6. Vídeo de 5 minutos carrega e analisa',
      Number.isFinite(dur) && dur > 290 && dur < 310 && longOk,
      `${Number.isFinite(dur) ? dur.toFixed(0) : dur}s`
    );
  } catch (error) {
    check('B6. Vídeo de 5 minutos carrega e analisa', false, error.message.slice(0, 80));
  }

  check('S. Nenhum erro de página durante a suíte', errors.length === 0, errors.slice(0, 2).join(' | '));
}

try {
  await run();
} catch (error) {
  check('Execução da suíte', false, error.message.slice(0, 200));
  if (page) await shot('erro-fatal').catch(() => {});
} finally {
  writeFileSync(join(EVID, 'resultado.json'), JSON.stringify(results, null, 2), 'utf8');
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas.`);
console.log(failed.length ? `REPROVADO — ${failed.map((f) => f.name).join(', ')}` : 'APROVADO');
process.exit(failed.length ? 1 : 0);
