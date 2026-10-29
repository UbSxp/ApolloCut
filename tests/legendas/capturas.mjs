/* Capturas de cada estilo de legenda nos dois temas.
   Gera docs/evidencias/legendas/{estilo}-{tema}.png para o relatório.
   Uso: node tests/legendas/capturas.mjs
*/
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'http://127.0.0.1:4173';
const SAIDA = path.join(ROOT, 'docs/evidencias/legendas');
const ESTILOS = ['ode', 'ditirambo', 'estrofe', 'marmore', 'helio'];

async function garantirServidor() {
  try {
    const res = await fetch(`${BASE}/index.html`, { method: 'HEAD' });
    if (res.ok) return null;
  } catch (_) { /* sobe abaixo */ }
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [path.join(ROOT, 'tools/servir.mjs'), '4173'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`${BASE}/index.html`, { method: 'HEAD' });
      if (res.ok) return child;
    } catch (_) { /* ainda subindo */ }
  }
  throw new Error('Servidor não respondeu');
}

async function main() {
  await fs.mkdir(SAIDA, { recursive: true });
  const servidor = await garantirServidor();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('   [browser]', m.text().slice(0, 160)); });

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__APOLLO_DEBUG__, null, { timeout: 60000 });
    // Pula a abertura (o modal intercepta cliques).
    const pular = page.locator('#openingSkip');
    if (await pular.isVisible().catch(() => false)) await pular.click();
    await page.waitForTimeout(400);

    // Carrega um clipe do banco de medição.
    await page.evaluate(async () => {
      const res = await fetch('/tests/legendas/clipes/01-limpo-normal.mp4');
      const blob = await res.blob();
      const file = new File([blob], '01-limpo-normal.mp4', { type: 'video/mp4' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('#fileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => Number(window.__APOLLO_DEBUG__.state.duration) > 0, null, { timeout: 60000 });

    // Duas legendas de exemplo, com tempos por palavra (para o karaokê).
    await page.evaluate(() => {
      const d = window.__APOLLO_DEBUG__;
      d.state.cues = [
        {
          start: 0.3,
          end: 4.5,
          text: 'Almocei ontem e fui ao mercado comprar pão e leite',
          words: [
            ['Almocei', 0.4, 0.9], ['ontem', 1.0, 1.3], ['e', 1.4, 1.5], ['fui', 1.6, 1.9],
            ['ao', 2.0, 2.1], ['mercado', 2.2, 2.7], ['comprar', 2.9, 3.3], ['pão', 3.5, 3.8],
            ['e', 3.9, 4.0], ['leite', 4.1, 4.4],
          ].map(([text, start, end]) => ({ text, start, end })),
          lines: [
            ['Almocei', 'ontem', 'e', 'fui', 'ao', 'mercado'],
            ['comprar', 'pão', 'e', 'leite'],
          ],
        },
        {
          start: 5.0,
          end: 8.0,
          text: 'Comprei pão e leite para o café da manhã',
          words: [
            ['Comprei', 5.1, 5.6], ['pão', 5.8, 6.0], ['e', 6.1, 6.2], ['leite', 6.3, 6.7],
            ['para', 6.9, 7.1], ['o', 7.2, 7.3], ['café', 7.4, 7.7], ['da', 7.8, 7.9], ['manhã', 8.0, 8.4],
          ].map(([text, start, end]) => ({ text, start, end })),
        },
      ];
      d.state.cueSource = 'exemplo';
      d.captions.lastCue = null;
      const video = d.els.previewVideo;
      video.currentTime = 2.2;
      d.captions.renderAt(2.2);
    });
    await page.waitForTimeout(600);

    // A grade de estilos vive na aba II; é preciso abri-la.
    await page.click('.console-tab[data-tab="captions"]');
    await page.waitForTimeout(300);

    const frame = page.locator('#frame');
    for (const tema of ['dark', 'light']) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      for (const estilo of ESTILOS) {
        await page.click(`#styleGrid [data-style="${estilo}"]`);
        await page.evaluate(() => {
          const d = window.__APOLLO_DEBUG__;
          d.captions.lastCue = null;
          d.captions.renderAt(2.2);
        });
        await page.waitForTimeout(250);
        const arquivo = path.join(SAIDA, `${estilo}-${tema}.png`);
        await frame.screenshot({ path: arquivo });
        console.log(`→ ${path.relative(ROOT, arquivo)}`);
      }
    }
  } finally {
    await browser.close();
    if (servidor) servidor.kill();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
