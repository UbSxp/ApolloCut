/* ============================================================
   APOLLOCUT — Accessibility check script
   ============================================================ */

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'esbuild';
import { mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

async function run() {
  // Build first
  const outDir = resolve('dist');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [resolve('src/main.js')],
    bundle: true,
    outfile: resolve(outDir, 'app.js'),
    format: 'esm',
    target: 'es2022',
    minify: true,
    treeShaking: true,
  });

  // Copy static files
  ['styles.css', 'manifest.webmanifest'].forEach(f => {
    copyFileSync(resolve(f), resolve(outDir, f));
  });

  let html = readFileSync(resolve('index.html'), 'utf-8');
  html = html.replace(/<script type="module" src="src\/main\.js"><\/script>/, '<script src="app.js"><\/script>');
  html = html.replace(/<script src="lib\/captions\.js"><\/script>\s*/, '');
  writeFileSync(resolve(outDir, 'index.html'), html);

  // Launch browser and run axe
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('file://' + resolve(outDir, 'index.html'));
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page }).analyze();

  await context.close();
  await browser.close();

  if (results.violations.length > 0) {
    console.error('❌ Accessibility violations found:');
    results.violations.forEach(v => {
      console.error(`  - ${v.id}: ${v.description}`);
      console.error(`    Impact: ${v.impact}`);
      console.error(`    Nodes: ${v.nodes.length}`);
      v.nodes.forEach(node => {
        console.error(`    HTML: ${node.html}`);
        console.error(`    Target: ${node.target.join(', ')}`);
      });
    });
    process.exit(1);
  }

  console.log('✅ No accessibility violations found');
}

run().catch(e => {
  console.error('A11y check failed:', e);
  process.exit(1);
});