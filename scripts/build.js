/* ============================================================
   APOLLOCUT — Build script (esbuild)
   Gera bundle otimizado para produção
   ============================================================ */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const outDir = resolve('dist');
const srcDir = resolve('src');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Copiar e processar index.html - substituir script module por bundled app.js
const indexSrc = resolve('index.html');
const indexDst = resolve(outDir, 'index.html');
if (existsSync(indexSrc)) {
  let html = readFileSync(indexSrc, 'utf-8');
  // Substituir <script type="module" src="src/main.js"></script> + initUI call por <script src="app.js"></script> + init
  html = html.replace(
    /<script type="module" src="src\/main\.js"><\/script>\s*<script type="module">[\s\S]*?initUI\(\);\s*<\/script>/,
    '<script src="app.js"></script>\n  <script>\n    if (window.ApolloCut && window.ApolloCut.initUI) {\n      window.ApolloCut.initUI();\n    }\n  </script>'
  );
  // Também remover o script src="lib/captions.js" já que está bundlado
  html = html.replace(
    /<script src="lib\/captions\.js"><\/script>\s*/,
    ''
  );
  writeFileSync(indexDst, html);
}

// Copiar styles.css e manifest.webmanifest
['styles.css', 'manifest.webmanifest'].forEach(f => {
  const src = resolve(f);
  if (existsSync(src)) copyFileSync(src, resolve(outDir, f));
});

// Copiar fonts
const fontsSrc = resolve('assets/fonts');
const fontsDst = resolve(outDir, 'assets/fonts');
if (existsSync(fontsSrc)) {
  mkdirSync(fontsDst, { recursive: true });
  // copy recursively would need fs.cpSync (node 16.7+)
  // simple copy for now
}

await build({
  entryPoints: [resolve('src/main.js')],
  bundle: true,
  outfile: resolve(outDir, 'app.js'),
  format: 'iife',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  treeShaking: true,
  globalName: 'ApolloCut',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('✅ Build completed in dist/');