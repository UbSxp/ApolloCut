import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'load' }).catch((e) => logs.push(`goto: ${e.message}`));
await page.waitForTimeout(2000);
const state = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  mode: document.documentElement.dataset.mode,
  warningVisible: !document.getElementById('fileWarning').hidden,
  warningText: document.getElementById('fileWarning').textContent.replace(/\s+/g, ' ').trim().slice(0, 120),
  crossOriginIsolated: self.crossOriginIsolated,
  sab: typeof SharedArrayBuffer,
  origin: location.origin,
  health: typeof window.__APOLLO_HEALTH__,
}));
console.log(JSON.stringify({ url, state, errors: logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).slice(0, 4) }, null, 2));
await browser.close();
