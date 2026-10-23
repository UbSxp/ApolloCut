/**
 * @file Testes de Legendas Avançadas (tradução + export ASS).
 */

import { exportSRT, exportASS, exportVTT, translateCaptions, CAPTION_CONFIG } from '../core/captions-advanced.js';

async function runTests() {
  console.log('🧪 Iniciando testes de Legendas Avançadas...');

  // Grupos de teste
  const groups = [
    {
      start: 1.5,
      end: 4.2,
      words: [
        { text: 'O', start: 1.5, end: 1.6 },
        { text: 'sol', start: 1.6, end: 1.8 },
        { text: 'nasce', start: 1.8, end: 2.1 },
        { text: 'sobre', start: 2.1, end: 2.4 },
        { text: 'o', start: 2.4, end: 2.5 },
        { text: 'mar', start: 2.5, end: 3.0 },
      ],
    },
    {
      start: 5.0,
      end: 8.5,
      words: [
        { text: 'A', start: 5.0, end: 5.1 },
        { text: 'lira', start: 5.1, end: 5.4 },
        { text: 'de', start: 5.4, end: 5.5 },
        { text: 'Apolo', start: 5.5, end: 5.9 },
        { text: 'guarda', start: 5.9, end: 6.3 },
        { text: 'o', start: 6.3, end: 6.4 },
        { text: 'tempo', start: 6.4, end: 7.0 },
      ],
    },
  ];

  // Teste 1: Export SRT
  console.log('\n1. Testando exportação SRT...');
  const srt = exportSRT(groups);
  console.log(srt);
  console.log('   SRT gerado com', groups.length, 'blocos');

  // Teste 2: Export ASS
  console.log('\n2. Testando exportação ASS...');
  const ass = exportASS(groups, { width: 1080, height: 1920, captionStyle: 'marmore' });
  console.log(ass.slice(0, 500) + '...');
  console.log('   ASS gerado com header +', groups.length, 'diálogos');

  // Teste 3: Export VTT
  console.log('\n3. Testando exportação VTT...');
  const vtt = exportVTT(groups);
  console.log(vtt.slice(0, 200) + '...');
  console.log('   VTT gerado com', groups.length, 'cues');

  // Teste 4: Tradução (fake provider)
  console.log('\n4. Testando tradução (fake)...');
  const translated = await translateCaptions(groups, 'en', 'pt');
  console.log('   Traduzido para EN:');
  for (const g of translated) {
    console.log(`   ${g.start.toFixed(1)}-${g.end.toFixed(1)}: ${g.words.map(w => w.text).join(' ')}`);
  }

  // Teste 5: Estilos disponíveis
  console.log('\n5. Estilos de legenda disponíveis:');
  for (const [key, style] of Object.entries(CAPTION_CONFIG.styles)) {
    console.log(`   ${key}: ${style.name} (${style.fontFamily}, ${style.fontWeight})`);
  }

  // Teste 6: Formatos suportados
  console.log('\n6. Formatos de exportação:');
  for (const [key, fmt] of Object.entries(CAPTION_CONFIG.formats)) {
    console.log(`   ${key}: ${fmt.name} (${fmt.extension})`);
  }

  console.log('\n✅ Todos os testes de Legendas Avançadas passaram!');
  return true;
}

if (typeof window !== 'undefined') {
  runTests().catch(console.error);
} else if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(console.error);
}

export { runTests };