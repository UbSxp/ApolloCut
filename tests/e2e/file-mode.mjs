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
await page.waitForTimeout(2500);
const state = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  hasApp: !!window.__APOLLO_DEBUG__,
  crossOriginIsolated: self.crossOriginIsolated,
  sab: typeof SharedArrayBuffer,
  origin: location.origin,
}));
console.log(JSON.stringify({ url, state, logs }, null, 2));
await browser.close();
