// scripts/generate-icons.mjs
// Gera 4 SVGs de ícones funcionais (traço 1.5px, currentColor, stroke-linecap="round", stroke-linejoin="round")
// Ícones: lira (7 cordas), arco+flecha, louro (ramo), trípode.

import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

const stroke = 1.5;
const attrs = `stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

// Lira: 7 cordas verticais entre dois arcos
const lira = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${attrs}>
  <path d="M6 4c0-2.2 1.8-4 4-4s4 1.8 4 4" />
  <path d="M6 20c0 2.2 1.8 4 4 4s4-1.8 4-4" />
  <line x1="6" y1="8" x2="6" y2="16" />
  <line x1="10" y1="8" x2="10" y2="16" />
  <line x1="14" y1="8" x2="14" y2="16" />
  <line x1="18" y1="8" x2="18" y2="16" />
  <line x1="8" y1="8" x2="8" y2="16" />
  <line x1="12" y1="8" x2="12" y2="16" />
  <line x1="16" y1="8" x2="16" y2="16" />
</svg>`;

// Arco + flecha: arco semicircular, flecha saindo do centro para a direita
const arco = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${attrs}>
  <path d="M4 12c0-6.6 5.4-12 12-12" />
  <line x1="16" y1="12" x2="22" y2="12" />
  <polyline points="18 8 22 12 18 16" />
</svg>`;

// Louro: ramo com folhas (simplificado)
const louro = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${attrs}>
  <path d="M12 2c-2 0-4 1.5-4 3.5 0 1.5 2 3 4 5 2-2 4-3.5 4-5 0-2-2-3.5-4-3.5z" />
  <path d="M12 22c2 0 4-1.5 4-3.5 0-1.5-2-3-4-5-2 2-4 3.5-4 5 0 2 2 3.5 4 3.5z" />
  <line x1="12" y1="5.5" x2="12" y2="18.5" />
</svg>`;

// Trípode: três pernas e base circular
const tripode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${attrs}>
  <ellipse cx="12" cy="20" rx="6" ry="2" />
  <path d="M6 20l-2-8M12 20v-8M18 20l2-8" />
  <line x1="4" y1="12" x2="20" y2="12" />
</svg>`;

fs.writeFileSync(path.join(outDir, 'lira.svg'), lira);
fs.writeFileSync(path.join(outDir, 'arco.svg'), arco);
fs.writeFileSync(path.join(outDir, 'louro.svg'), louro);
fs.writeFileSync(path.join(outDir, 'tripode.svg'), tripode);

console.log('✓ ícones gerados: lira.svg, arco.svg, louro.svg, tripode.svg');