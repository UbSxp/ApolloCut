// tests/tokens.test.js
// Verifica se os arquivos de tokens CSS foram gerados com os valores esperados do spec.

import fs from 'fs';
import path from 'path';

const tokensDir = path.resolve('tokens');
const publicDir = path.resolve('public');

const requiredFiles = [
  'theme.css',
  'spacing.css',
  'typography.css',
  'colors.css',
];

const expectedInTheme = [
  '--luz-x',
  '--luz-y',
  '--tema-fase',
  '0.90 0.06 45',   // aurora
  '0.96 0.02 60',   // dia
  '0.85 0.10 30',   // entardecer
  '0.18 0.04 240',  // noite
];

const expectedInSpacing = [
  '--space-inset-xs',
  '--space-inset-sm',
  '--space-inset-md',
  '--space-inset-lg',
  '--space-stack-xs',
  '--space-stack-sm',
  '--space-stack-md',
  '--space-stack-lg',
  '--space-inline-xs',
  '--space-inline-sm',
  '--space-inline-md',
  '--space-inline-lg',
];

const expectedInTypography = [
  '--font-heading',
  '--font-body',
  '--text-display',
  '--text-h1',
  '--text-h2',
  '--text-h3',
  '--text-body-lg',
  '--text-body',
  '--text-body-sm',
  '--text-caption',
];

const expectedInColors = [
  '--stone-pentelic',
  '--marble-parian',
  '--surface-hover',
  '--border-default',
  '--border-focus',
  '--aegean-deep',
  '--aurora-blue',
  '--gold-leaf',
  '--amphora-terracotta',
  '--black-figure',
  '--laurel-muted',
  '--error-bg',
  '--success-bg',
];

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function testFileExists(file) {
  const full = path.join(tokensDir, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Arquivo de token não encontrado: ${full}`);
  }
  return readFile(full);
}

function testPublicAsset(asset) {
  const full = path.join(publicDir, asset);
  if (!fs.existsSync(full)) {
    throw new Error(`Asset público não encontrado: ${full}`);
  }
  const stats = fs.statSync(full);
  if (stats.size === 0) {
    throw new Error(`Asset vazio: ${full}`);
  }
}

console.log('Iniciando testes de tokens...');

try {
  // 1. Verifica existência dos arquivos de tokens
  for (const f of requiredFiles) {
    const content = testFileExists(f);
    console.log(`✓ ${f} existe (${content.length} chars)`);
  }

  // 2. Valida conteúdo de theme.css
  const theme = testFileExists('theme.css');
  for (const token of expectedInTheme) {
    if (!theme.includes(token)) {
      throw new Error(`theme.css não contém token esperado: ${token}`);
    }
    console.log(`✓ theme.css contém ${token}`);
  }

  // 3. Valida spacing.css
  const spacing = testFileExists('spacing.css');
  for (const token of expectedInSpacing) {
    if (!spacing.includes(token)) {
      throw new Error(`spacing.css não contém token esperado: ${token}`);
    }
    console.log(`✓ spacing.css contém ${token}`);
  }

  // 4. Valida typography.css
  const typo = testFileExists('typography.css');
  for (const token of expectedInTypography) {
    if (!typo.includes(token)) {
      throw new Error(`typography.css não contém token esperado: ${token}`);
    }
    console.log(`✓ typography.css contém ${token}`);
  }

  // 5. Valida colors.css
  const colors = testFileExists('colors.css');
  for (const token of expectedInColors) {
    if (!colors.includes(token)) {
      throw new Error(`colors.css não contém token esperado: ${token}`);
    }
    console.log(`✓ colors.css contém ${token}`);
  }

  // 6. Assets públicos
  testPublicAsset('texture-marble.webp');
  console.log('✓ texture-marble.webp existe e não vazio');
  testPublicAsset('meander.svg');
  console.log('✓ meander.svg existe e não vazio');
  const iconFiles = ['lira.svg', 'arco.svg', 'louro.svg', 'tripode.svg'];
  for (const ic of iconFiles) {
    testPublicAsset(`icons/${ic}`);
    console.log(`✓ icons/${ic} existe e não vazio`);
  }

  console.log('\n✅ Todos os testes de tokens passaram.');
  process.exit(0);
} catch (err) {
  console.error('❌ Falha nos testes de tokens:', err.message);
  process.exit(1);
}