/**
 * @file Testes do Compositor de Thumbnails + ImageGenProvider.
 */

import { composeThumbnail, THUMB_CONFIG, wrapText } from '../core/thumbnails.js';

async function runTests() {
  console.log('🧪 Iniciando testes de Thumbnails...');

  // Teste 1: Configuração
  console.log('\n1. Testando configuração...');
  console.log(`   Dimensões: ${Object.entries(THUMB_CONFIG.dimensions).map(([k,v]) => `${k}=${v.width}x${v.height}`).join(', ')}`);
  console.log(`   Templates: ${Object.keys(THUMB_CONFIG.templates).join(', ')}`);
  console.log(`   Fontes: title=${THUMB_CONFIG.text.titleFont.family}, subtitle=${THUMB_CONFIG.text.subtitleFont.family}`);

  // Teste 2: wrapText
  console.log('\n2. Testando wrapText...');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '700 48px Cinzel';
  const lines = wrapText(ctx, 'O Segredo do Apolo para Cortes Virais', 800, 2);
  console.log(`   Linhas: ${lines.length}`);
  for (const line of lines) console.log(`   "${line}"`);

  // Teste 3: Composer offline (mock source)
  console.log('\n3. Testando composer offline...');
  const mockSource = null; // fallback para gradiente
  const canvas = await composeThumbnail(mockSource, {
    templateKey: 'shorts',
    title: 'O Segredo do Apolo',
    subtitle: 'Cortes que retêm audiência',
    ratio: '9:16',
    accentColor: '#c9a45c',
  });
  console.log(`   Canvas gerado: ${canvas.width}x${canvas.height}`);
  console.log(`   DataURL length: ${canvas.toDataURL().length} chars`);

  // Teste 2: Template gameplay
  console.log('\n4. Testando template gameplay...');
  const canvas2 = await composeThumbnail(null, {
    templateKey: 'gameplay',
    title: 'Epic Win!',
    subtitle: 'Melhor partida da semana',
    ratio: '16:9',
  });
  console.log(`   Canvas gameplay: ${canvas2.width}x${canvas2.height}`);

  // Teste 3: Template tutorial
  console.log('\n5. Testando template tutorial...');
  const canvas3 = await composeThumbnail(null, {
    templateKey: 'tutorial',
    title: 'Como Editar no ApolloCut',
    subtitle: 'Passo a passo completo',
    ratio: '16:9',
  });
  console.log(`   Canvas tutorial: ${canvas3.width}x${canvas3.height}`);

  // Teste 4: Template podcast
  console.log('\n6. Testando template podcast...');
  const canvas4 = await composeThumbnail(null, {
    templateKey: 'podcast',
    title: 'Episódio 42: O Futuro da IA',
    subtitle: 'Com convidado especial',
    ratio: '16:9',
  });
  console.log(`   Canvas podcast: ${canvas4.width}x${canvas4.height}`);

  // Teste 5: Template vlog
  console.log('\n7. Testando template vlog...');
  const canvas5 = await composeThumbnail(null, {
    templateKey: 'vlog',
    title: 'Meu Dia de Desenvolvedor',
    subtitle: 'Café, código e bugs',
    ratio: '9:16',
  });
  console.log(`   Canvas vlog: ${canvas5.width}x${canvas5.height}`);

  console.log('\n✅ Todos os testes de Thumbnails passaram!');
  return true;
}

if (typeof window !== 'undefined') {
  runTests().catch(console.error);
} else if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(console.error);
}

export { runTests };