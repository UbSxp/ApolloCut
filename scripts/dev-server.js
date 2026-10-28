/* ============================================================
   APOLLOCUT — Development Server
   ============================================================ */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const root = resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  // CORS for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  
  const filePath = resolve(root, url.slice(1));
  
  console.log(`[DEV SERVER] ${req.method} ${url} -> ${filePath} (exists: ${existsSync(filePath)})`);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  if (!existsSync(filePath)) {
    console.log(`[DEV SERVER] File not found, SPA fallback for: ${url}`);
    // SPA fallback
    if (url !== '/index.html') {
      const indexPath = resolve(root, 'index.html');
      if (existsSync(indexPath)) {
        serveFile(indexPath, res);
        return;
      }
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  
  serveFile(filePath, res);
});

function serveFile(filePath, res) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 ApolloCut dev server running at http://localhost:${PORT}`);
  console.log(`📁 Serving from ${root}`);
});