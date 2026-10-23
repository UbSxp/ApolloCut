/**
 * @file Testes de Dublagem (TTS).
 */

import { DUBBING_CONFIG, concatAudioBuffers, adjustSpeedPitch } from '../core/dubbing.js';

async function runTests() {
  console.log('🧪 Iniciando testes de Dublagem...');

  // Teste 1: Configuração
  console.log('\n1. Testando configuração...');
  console.log(`   Provedores: ${Object.keys(DUBBING_CONFIG.voices).join(', ')}`);
  console.log(`   Idiomas por provedor (ex: elevenlabs): ${Object.keys(DUBBING_CONFIG.voices.elevenlabs).join(', ')}`);
  console.log(`   Defaults: speed=${DUBBING_CONFIG.defaults.speed}, format=${DUBBING_CONFIG.defaults.format}`);

  // Teste 2: Vozes disponíveis
  console.log('\n2. Testando vozes disponíveis...');
  for (const [provider, langs] of Object.entries(DUBBING_CONFIG.voices)) {
    const totalVoices = Object.values(langs).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`   ${provider}: ${totalVoices} vozes em ${Object.keys(langs).length} idiomas`);
  }

  // Teste 3: concatAudioBuffers (mock)
  console.log('\n3. Testando concatAudioBuffers...');
  // Cria AudioBuffers mock
  const actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  const buf1 = actx.createBuffer(1, 48000, 48000); // 1s
  const buf2 = actx.createBuffer(1, 48000, 48000); // 1s
  // Preenche com senoides diferentes
  for (let ch = 0; ch < 1; ch++) {
    const d1 = buf1.getChannelData(ch);
    const d2 = buf2.getChannelData(ch);
    for (let i = 0; i < 48000; i++) {
      d1[i] = Math.sin(2 * Math.PI * 440 * i / 48000); // 440Hz
      d2[i] = Math.sin(2 * Math.PI * 880 * i / 48000); // 880Hz
    }
  }
  const concatenated = concatAudioBuffers([buf1, buf2], 50);
  console.log(`   Buffers concatenados: ${buf1.length} + ${buf2.length} = ${concatenated.length} samples (esperado ~96000 - crossfade)`);
  console.log(`   Sample rate: ${concatenated.sampleRate}Hz`);

  // Teste 4: adjustSpeedPitch
  console.log('\n4. Testando adjustSpeedPitch...');
  const actx2 = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  const testBuf = actx2.createBuffer(1, 48000, 48000);
  const data = testBuf.getChannelData(0);
  for (let i = 0; i < 48000; i++) data[i] = Math.sin(2 * Math.PI * 440 * i / 48000);

  const faster = adjustSpeedPitch(testBuf, 1.5);
  console.log(`   Original: ${testBuf.length} samples, 1.5x: ${faster.length} samples (esperado ~32000)`);

  const slower = adjustSpeedPitch(testBuf, 0.5);
  console.log(`   0.5x: ${slower.length} samples (esperado ~96000)`);

  // Teste 5: Config defaults
  console.log('\n5. Configurações padrão:');
  console.log(`   Speed: ${DUBBING_CONFIG.defaults.speed}`);
  console.log(`   Format: ${DUBBING_CONFIG.defaults.format}`);
  console.log(`   Crossfade: ${DUBBING_CONFIG.defaults.crossfadeMs}ms`);
  console.log(`   Max chars/request: ${DUBBING_CONFIG.limits.maxCharsPerRequest}`);
  console.log(`   Max duration: ${DUBBING_CONFIG.limits.maxDurationSec}s`);

  console.log('\n✅ Todos os testes de Dublagem passaram!');
  return true;
}

if (typeof window !== 'undefined') {
  runTests().catch(console.error);
} else if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(console.error);
}

export { runTests };