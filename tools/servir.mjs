/* ============================================================
   APOLLOCUT — Servidor local (sem dependências)
   Serve o app em http://localhost:PORT com os cabeçalhos que
   WebAssembly/Web Workers precisam:
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
   Uso: node tools/servir.mjs [porta]
   ============================================================ */

import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep, basename, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.ass': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = resolve(ROOT, '.' + decoded);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...HEADERS, 'Content-Type': type });
  res.end(body);
}

/* ---------- salvar o corte no disco ----------
   O download do navegador embutido do app falha em arquivos grandes
   (> ~5 MB): o gerenciador de downloads entrega 0 byte. Aqui o vídeo é
   gravado direto na pasta Downloads, sem limite de tamanho. */

const DOWNLOADS = join(homedir(), 'Downloads');

function destinoLivre(dir, nome) {
  const ext = extname(nome);
  const base = basename(nome, ext).slice(0, 80) || 'apollocut-corte';
  let alvo = join(dir, base + ext);
  for (let i = 1; existsSync(alvo) && i < 1000; i++) alvo = join(dir, `${base}-${i}${ext}`);
  return alvo;
}

function salvar(req, res) {
  const params = new URL(req.url, `http://${HOST}`).searchParams;
  const pedido = basename(params.get('name') || 'apollocut-corte.webm');
  const nome = pedido.replace(/[^\w.\- ]+/g, '_');
  const ext = extname(nome).toLowerCase();
  if (ext !== '.mp4' && ext !== '.webm') {
    send(res, 400, 'Extensão não permitida (use .mp4 ou .webm)');
    return;
  }

  const dir = existsSync(DOWNLOADS) ? DOWNLOADS : ROOT;
  const alvo = destinoLivre(dir, nome);
  const out = createWriteStream(alvo);
  let bytes = 0;
  req.on('data', (chunk) => { bytes += chunk.length; });

  const falhar = (error) => {
    console.error('salvar:', error.message);
    send(res, 500, `Falha ao gravar: ${error.message}`);
  };
  req.on('error', falhar);
  out.on('error', falhar);
  out.on('finish', () => {
    send(res, 200, JSON.stringify({ path: alvo, bytes }), 'application/json; charset=utf-8');
  });
  req.pipe(out);
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/salvar')) {
    salvar(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Método não permitido');
    return;
  }

  let target = safePath(req.url === '/' ? '/index.html' : req.url);
  if (!target) {
    send(res, 403, 'Proibido');
    return;
  }

  if (existsSync(target) && statSync(target).isDirectory()) {
    target = resolve(target, 'index.html');
  }

  if (!existsSync(target)) {
    send(res, 404, `Não encontrado: ${req.url}`);
    return;
  }

  const stat = statSync(target);
  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  // Range requests: necessários para o <video> buscar trechos e para o player
  // fazer seek sem baixar o arquivo inteiro.
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { ...HEADERS, 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        ...HEADERS,
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(target, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    ...HEADERS,
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(target).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`ApolloCut em http://localhost:${PORT}`);
  console.log('COOP/COEP ativos (crossOriginIsolated = true)');
});
