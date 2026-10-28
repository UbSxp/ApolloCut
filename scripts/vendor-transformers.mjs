/* Gera vendor/transformers.bundle.mjs + vendor/ort/* para rodar Whisper
   localmente, sem CDN e sem import map (funciona em Web Worker).
   Uso: node scripts/vendor-transformers.mjs */
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outDir = join(root, 'vendor');
const ortDir = join(outDir, 'ort');
mkdirSync(ortDir, { recursive: true });

await build({
  entryPoints: [join(root, 'node_modules/@huggingface/transformers/dist/transformers.web.min.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: join(outDir, 'transformers.bundle.mjs'),
  legalComments: 'none',
  logLevel: 'info',
});

// wasm do onnxruntime fica ao lado do bundle; o worker aponta wasmPaths para cá.
const ortDist = join(root, 'node_modules/onnxruntime-web/dist');
for (const name of readdirSync(ortDist)) {
  if (name.endsWith('.wasm') || name.endsWith('.mjs')) {
    const src = join(ortDist, name);
    if (statSync(src).isFile()) copyFileSync(src, join(ortDir, name));
  }
}
console.log('vendor pronto:', outDir);
