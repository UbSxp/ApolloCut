// scripts/meander.mjs
// Gera SVG do padrão grego (meandro) com módulo 8px, espessura 1px.
// O path é calculado geometricamente: repete o padrão de "chave" horizontamente.

import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public');
fs.mkdirSync(outDir, { recursive: true });

const M = 8; // módulo em px
const stroke = 1;

// Função que cria uma unidade do meandro (um "zig-zag" horizontal)
function meanderUnit(x, y) {
  // Desenha: direita M, baixo M, esquerda M, baixo M, direita M
  // Coordenadas relativas
  const d = [];
  d.push(`M${x},${y}`);
  d.push(`h${M}`);      // direita
  d.push(`v${M}`);      // baixo
  d.push(`h${-M}`);     // esquerda
  d.push(`v${M}`);      // baixo
  d.push(`h${M}`);      // direita
  return d.join(' ');
}

// Gera pattern com 4 unidades (largura total 4*M = 32px)
const width = 4 * M;
const height = 2 * M;
let pathData = '';
for (let i = 0; i < 4; i++) {
  pathData += meanderUnit(i * M, 0) + ' ';
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <path d="${pathData.trim()}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="square" stroke-linejoin="miter"/>
</svg>`;

const outPath = path.join(outDir, 'meander.svg');
fs.writeFileSync(outPath, svg);
console.log('✓ meander.svg gerado (width:', width, 'height:', height, ')');