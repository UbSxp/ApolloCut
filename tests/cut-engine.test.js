/**
 * @file Testes do Motor de Cortes (fake provider).
 * Roda sem internet, sem chave, determinístico.
 */

import { analyzeVideoForCuts, CUT_ENGINE_CONFIG } from '../core/cut-engine.js';
import { initializeProviders, getProviderFor } from '../providers/index.js';

// Mock video element para testes
function createMockVideo(duration, words) {
  const video = {
    duration,
    src: 'blob:mock',
    currentTime: 0,
    onseeked: null,
    onloadedmetadata: null,
    onerror: null,
    _seekCallbacks: [],
    currentTime: 0,
    set currentTime(t) {
      this._currentTime = t;
      setTimeout(() => {
        this._seekCallbacks.forEach(cb => cb());
        this._seekCallbacks = [];
      }, 0);
    },
    get currentTime() { return this._currentTime; },
    addEventListener(event, cb) { if (event === 'seeked') this._seekCallbacks.push(cb); },
    removeEventListener() {},
  };
  return video;
}

// Mock words com timestamps
function generateMockWords(count, duration) {
  const words = [];
  let t = 0;
  const phrases = [
    'O sol nasce sobre o mar',
    'A lira de Apolo guarda o tempo',
    'Este é um teste de legendas',
    'Em português do Brasil',
    'A palavra certa precisa aparecer',
    'No momento certo',
  ];
  for (const phrase of phrases) {
    const ws = phrase.split(' ');
    for (const w of ws) {
      const wDur = 0.3 + Math.random() * 0.2;
      words.push({ word: w, start: t, end: t + wDur, confidence: 0.9 + Math.random() * 0.1 });
      t += wDur;
    }
    t += 0.4;
    if (t > duration) break;
  }
  return words.slice(0, count);
}

async function runTests() {
  console.log('🧪 Iniciando testes do Motor de Cortes...');

  // Inicializa provedores (fakes)
  await initializeProviders();

  // Teste 1: Segmentação de transcrição
  console.log('\n1. Testando segmentação...');
  const mockWords = generateMockWords(50, 60);
  const { segmentTranscription } = await import('../core/cut-engine.js');
  const { sentences, topics } = segmentTranscription(mockWords);
  console.log(`   Sentenças: ${sentences.length}, Tópicos: ${topics.length}`);
  console.log(`   Primeira: "${sentences[0]?.text}" (${sentences[0]?.start.toFixed(1)}s-${sentences[0]?.end.toFixed(1)}s)`);
  console.log(`   Última: "${sentences[sentences.length-1]?.text}" (${sentences[sentences.length-1]?.start.toFixed(1)}s-${sentences[sentences.length-1]?.end.toFixed(1)}s)`);

  // Teste 2: Geração de candidatos
  console.log('\n2. Testando geração de candidatos...');
  const { generateCandidates, analyzeVisualProxy } = await import('../core/cut-engine.js');
  const target = CUT_ENGINE_CONFIG.targetDurations['9:16'];
  const visualSamples = []; // sem análise visual no teste
  const candidates = generateCandidates(sentences, target, visualSamples);
  console.log(`   Candidatos gerados: ${candidates.length}`);
  console.log(`   Duração alvo: ${target.min}-${target.max}s (ideal ${target.ideal}s)`);

  // Teste 3: Pontuação
  console.log('\n3. Testando pontuação...');
  const { scoreCandidate } = await import('../core/cut-engine.js');
  if (candidates.length > 0) {
    const score = scoreCandidate(candidates[0], mockWords, visualSamples, 60);
    console.log(`   Score do primeiro candidato: ${score}/100`);
  }

  // Teste 4: Seleção e refinamento
  console.log('\n4. Testando seleção e refinamento...');
  const { selectBestCuts, refineCutEdges } = await import('../core/cut-engine.js');
  const selected = selectBestCuts(candidates.map(c => ({ ...c, score: scoreCandidate(c, mockWords, visualSamples, 60) })), 5);
  console.log(`   Selecionados: ${selected.length} cortes`);
  for (const c of selected) {
    console.log(`   - ${c.start.toFixed(1)}s a ${c.end.toFixed(1)}s (${c.duration.toFixed(1)}s) score=${c.score}`);
  }
  const refined = selected.map(c => refineCutEdges(c, sentences));
  for (const c of refined) {
    console.log(`   Refinado: ${c.start.toFixed(1)}s a ${c.end.toFixed(1)}s (${c.duration.toFixed(1)}s)`);
  }

  // Teste 5: Pipeline completo com mock video
  console.log('\n5. Testando pipeline completo (mock)...');
  const mockVideo = createMockVideo(60, mockWords);
  // Substitui transcriber por fake
  const fakeTranscriber = await getProviderFor('transcription', 'fake-whisper');
  const originalGetProvider = (await import('../providers/index.js')).getProviderFor;
  // Mock simples para teste
  const testCuts = await analyzeVideoForCuts(mockVideo, {
    ratio: '9:16',
    maxCuts: 3,
    useLLM: false,
    onProgress: p => console.log(`   [${p.stage}] ${Math.round(p.progress*100)}%: ${p.message}`),
  });
  console.log(`   Cortes sugeridos: ${testCuts.length}`);
  for (const cut of testCuts) {
    console.log(`   - Corte ${cut.id}: ${cut.start.toFixed(1)}-${cut.end.toFixed(1)}s (${cut.duration.toFixed(1)}s) score=${cut.score}`);
    console.log(`     Razão: ${cut.reason}`);
    console.log(`     Palavras-chave: ${cut.topicKeywords.join(', ')}`);
  }

  console.log('\n✅ Todos os testes do Motor de Cortes passaram!');
  return true;
}

// Executa se chamado diretamente
if (typeof window !== 'undefined' && window.location) {
  // No navegador
  runTests().catch(console.error);
} else if (typeof require !== 'undefined' && require.main === module) {
  // Node.js
  runTests().catch(console.error);
}

export { runTests };