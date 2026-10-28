/* ============================================================
   APOLLOCUT - Teste das abas, da previa dos cortes e da edicao
   de legendas. Roda contra o servidor local (tools/servir.mjs).
   Uso: node tests/e2e/abas-e-previa.mjs
   ============================================================ */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import ffprobe from 'ffprobe-static';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'APROVADO' : 'REPROVADO'} - ${name}${detail ? ` (${detail})` : ''}`);
}

async function startServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return null;
  } catch (_) { /* sobe abaixo */ }
  const child = spawn(process.execPath, [join(ROOT, 'tools', 'servir.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      if ((await fetch(`${BASE}/index.html`)).ok) return child;
    } catch (_) { /* ainda subindo */ }
  }
  throw new Error('servidor nao subiu');
}

const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(`${BASE}/?abas=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.locator('#openingSkip').click();
  await page.waitForTimeout(600);

  await page.evaluate(async () => {
    const blob = await (await fetch('/tests/fixtures/fala-ptbr.mp4')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'fala-ptbr.mp4', { type: 'video/mp4' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => window.__APOLLO_DEBUG__?.state?.ready === true, { timeout: 20000 });

  await page.click('#analyzeBtn');
  await page.waitForFunction(() => window.__APOLLO_DEBUG__?.state?.clips?.length > 0, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // 1. aba II abre por clique
  await page.click('.console-tab[data-tab="captions"]');
  await page.waitForTimeout(150);
  const captionsOpen = await page.evaluate(() => ({
    tab: window.__APOLLO_DEBUG__.state.ui.tab,
    hidden: document.getElementById('tabCaptions').hidden,
    selected: document.querySelector('.console-tab[data-tab="captions"]').getAttribute('aria-selected'),
  }));
  check('1. Aba II abre no clique', captionsOpen.tab === 'captions' && captionsOpen.hidden === false && captionsOpen.selected === 'true');

  // 2. aba III abre por clique
  await page.click('.console-tab[data-tab="publish"]');
  await page.waitForTimeout(150);
  const publishOpen = await page.evaluate(() => ({
    tab: window.__APOLLO_DEBUG__.state.ui.tab,
    hidden: document.getElementById('tabPublish').hidden,
    exportEnabled: !document.getElementById('exportBtn').disabled,
  }));
  check('2. Aba III abre no clique', publishOpen.tab === 'publish' && publishOpen.hidden === false && publishOpen.exportEnabled);

  // 3. previa dos cortes (miniatura visivel)
  await page.click('.console-tab[data-tab="scene"]');
  const thumbs = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.clip-card')];
    const first = cards[0]?.querySelector('.clip-thumb');
    const img = first?.querySelector('img');
    return {
      cards: cards.length,
      imgs: document.querySelectorAll('.clip-thumb img').length,
      placeholders: document.querySelectorAll('.clip-thumb-loading').length,
      loaded: !!img && img.complete && img.naturalWidth > 0,
    };
  });
  check('3. Miniaturas dos cortes aparecem', thumbs.cards === 4 && thumbs.imgs === 4 && thumbs.placeholders === 0 && thumbs.loaded);

  // 4. selecionar corte move o player para o inicio do trecho
  const startOfThird = await page.evaluate(() => window.__APOLLO_DEBUG__.state.clips[2].start);
  await page.evaluate(() => document.querySelectorAll('.clip-card')[2].click());
  await page.waitForTimeout(300);
  const selected = await page.evaluate(() => ({
    label: document.getElementById('previewLabel').textContent,
    time: document.getElementById('previewVideo').currentTime,
    title: document.getElementById('activeClipTitle').textContent,
  }));
  check('4. Selecionar corte mostra a previa do trecho', selected.label === 'Corte 3' && Math.abs(selected.time - startOfThird) < 0.25 && selected.title === 'Corte 3');

  // 5. tocar o corte para no fim do trecho
  await page.evaluate(() => document.querySelectorAll('.clip-card')[1].querySelector('.clip-play').click());
  await page.waitForTimeout(900);
  const playing = await page.evaluate(() => ({ paused: document.getElementById('previewVideo').paused, t: document.getElementById('previewVideo').currentTime }));
  await page.waitForFunction(() => document.getElementById('previewVideo').paused === true, { timeout: 15000 });
  const stopped = await page.evaluate(() => {
    const v = document.getElementById('previewVideo');
    const clip = window.__APOLLO_DEBUG__.state.clips[1];
    return { t: v.currentTime, end: clip.end };
  });
  check('5. Tocar o corte respeita inicio e fim', playing.paused === false && Math.abs(stopped.t - stopped.end) < 0.25);

  // 6. editar legenda a mao
  await page.click('.console-tab[data-tab="captions"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    document.getElementById('previewVideo').currentTime = 0.5;
  });
  await page.waitForTimeout(300);
  await page.click('#addCueBtn');
  await page.waitForTimeout(150);
  await page.fill('.cue-row textarea', 'texto escrito a mao');
  await page.evaluate(() => {
    const v = document.getElementById('previewVideo');
    v.currentTime = 0.5;
  });
  await page.waitForTimeout(500);
  const cue = await page.evaluate(() => ({
    text: window.__APOLLO_DEBUG__.state.cues[0]?.text,
    frame: document.getElementById('captions').textContent,
    rows: document.querySelectorAll('.cue-row').length,
    srtEnabled: !document.getElementById('exportSrtBtn').disabled,
  }));
  check('6. Editar legenda a mao reflete no quadro', cue.text === 'texto escrito a mao' && cue.frame === 'texto escrito a mao' && cue.rows === 1 && cue.srtEnabled);

  // 7. ficha de publicacao preenchida
  await page.click('.console-tab[data-tab="publish"]');
  await page.click('#kitBtn');
  await page.waitForTimeout(250);
  const kit = await page.evaluate(() => ({
    title: document.getElementById('kitTitle').textContent,
    desc: document.getElementById('kitDescription').textContent,
    tags: document.getElementById('kitHashtags').textContent,
  }));
  check('7. Ficha de publicacao e preenchida', kit.title.length > 10 && kit.desc.includes('Corte') && kit.tags.includes('#Shorts'));
  await page.click('#kitClose');

  // 8. capa gera imagem real
  await page.click('#coverBtn');
  await page.waitForTimeout(900);
  const cover = await page.evaluate(() => {
    const canvas = document.getElementById('coverCanvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4000) if (data[i] > 20 || data[i + 1] > 20 || data[i + 2] > 20) lit++;
    return { frame: (window.__APOLLO_DEBUG__.state.cover.frame || '').slice(0, 22), lit };
  });
  check('8. Capa gera imagem real', cover.frame === 'data:image/png;base64,' && cover.lit > 100);
  await page.click('#coverClose');

  // 9. exportacao gera MP4 H.264 de verdade
  await page.click('#exportBtn');
  await page.waitForTimeout(300);
  await page.click('#exportStart');
  await page.waitForSelector('#exportResult:not([hidden])', { timeout: 90000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#downloadLink');
  const download = await downloadPromise;
  const outFile = join(ROOT, 'docs', 'evidencias', 'corte-rodada07.mp4');
  await download.saveAs(outFile);
  const info = await new Promise((done) => {
    const child = spawn(ffprobe.path, ['-v', 'error', '-count_packets', '-print_format', 'json', '-show_format', '-show_streams', outFile]);
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.on('close', () => { try { done(JSON.parse(text)); } catch (_) { done(null); } });
  });
  const vstream = info?.streams?.find((s) => s.codec_type === 'video');
  const duration = Number(info?.format?.duration || 0);
  check(
    '9. Exportacao gera MP4 H.264 jogavel',
    /mp4/.test(info?.format?.format_name || '') && vstream?.codec_name === 'h264' && vstream.width === 720 && vstream.height === 1280 && Math.abs(duration - 5) < 0.8 && Number(vstream.nb_read_packets) >= 100,
    `${info?.format?.format_name} ${vstream?.codec_name} ${vstream?.width}x${vstream?.height} ${duration.toFixed(2)}s`
  );

  check('10. Nenhum erro de pagina', errors.length === 0, errors.join(' | ').slice(0, 200));
} finally {
  await browser.close();
  if (server) server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} aprovados`);
process.exit(failed.length ? 1 : 0);
