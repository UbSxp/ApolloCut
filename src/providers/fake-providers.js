/**
 * @file Provedores FALSOS (fake) para testes automatizados.
 * Obrigatórios para cada interface — rodam sem internet, sem chave, determinísticos.
 * Usados em: testes unitários, testes de integração, CI, desenvolvimento offline.
 */

import {
  LLMProvider,
  TranscriptionProvider,
  TranslationProvider,
  TTSProvider,
  ImageGenerationProvider,
  VideoGenerationProvider,
  VideoToVideoProvider,
  SocialPublishProvider,
  registerProvider,
} from './interfaces.js';

/* ---------------------------------------------------------------
   Fake LLM Provider
   --------------------------------------------------------------- */
class FakeLLMProvider extends LLMProvider {
  constructor() {
    super({
      name: 'fake-llm',
      type: 'llm',
      capabilities: {
        models: ['fake-gpt-4', 'fake-claude-3'],
        languages: ['pt', 'en', 'es'],
        limits: { maxTokens: 4000 },
        streaming: false,
      },
      costTable: {
        unit: 'token',
        rates: { 'fake-gpt-4': 0.00001, 'fake-claude-3': 0.000008 },
      },
      timeoutMs: 100,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  validateInput(input) {
    if (!input?.prompt || typeof input.prompt !== 'string') {
      return { valid: false, error: 'Prompt é obrigatório e deve ser string' };
    }
    return { valid: true };
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    if (signal?.aborted) throw new Error('Cancelled');

    // Simula processamento
    if (onProgress) onProgress({ stage: 'thinking', progress: 0.3, message: 'Analisando...' });
    await new Promise(r => setTimeout(r, 50));
    if (signal?.aborted) throw new Error('Cancelled');
    if (onProgress) onProgress({ stage: 'generating', progress: 0.7, message: 'Gerando resposta...' });
    await new Promise(r => setTimeout(r, 30));

    const prompt = input.prompt.toLowerCase();
    let text = '';

    // Respostas determinísticas baseadas no prompt
    if (prompt.includes('pontue') || prompt.includes('score') || prompt.includes('ranque')) {
      text = JSON.stringify({
        clips: [
          { start: 12.5, end: 27.3, score: 92, reason: 'Gancho forte nos primeiros 3s, ideia completa, alta energia' },
          { start: 45.0, end: 58.7, score: 87, reason: 'Pergunta de impacto, mudança de cena, boa densidade de fala' },
          { start: 102.1, end: 115.4, score: 81, reason: 'Pico de risada, final de tópico, boa transição' },
        ],
        reasoning: 'Heurística local: gancho, completude, densidade, energia, picos, perguntas, mudança de cena.',
      });
    } else if (prompt.includes('título') || prompt.includes('title')) {
      text = JSON.stringify({
        title: 'O Segredo do Apolo para Cortes Virais',
        description: 'Descubra como transformar vídeos longos em Shorts que retêm audiência.',
        tags: ['apolocut', 'shorts', 'edicao', 'dicas'],
      });
    } else {
      text = JSON.stringify({ ok: true, message: 'Resposta fake do LLM', prompt: input.prompt.slice(0, 100) });
    }

    return {
      ok: true,
      data: { text, usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 } },
      costEstimated: 0.001,
      metadata: { model: 'fake-gpt-4', latencyMs: 80 },
    };
  }

  async estimateCost(input) {
    const tokens = (input.prompt?.length ?? 0) / 4 + (input.maxTokens ?? 2000);
    return { costEstimated: tokens * 0.00001, details: `~${Math.round(tokens)} tokens × R$0,00001` };
  }

  async checkAvailability() {
    return { available: true, reason: 'Fake provider sempre disponível' };
  }
}

/* ---------------------------------------------------------------
   Fake Transcription Provider (Whisper local simulado)
   --------------------------------------------------------------- */
class FakeTranscriptionProvider extends TranscriptionProvider {
  constructor() {
    super({
      name: 'fake-whisper',
      type: 'transcription',
      capabilities: {
        models: ['fake-whisper-small', 'fake-whisper-medium'],
        languages: ['pt', 'en', 'es', 'auto'],
        limits: { maxDurationSec: 3600 },
        streaming: false,
      },
      costTable: {
        unit: 'minute',
        rates: { 'fake-whisper-small': 0.0, 'fake-whisper-medium': 0.0 },
      },
      timeoutMs: 5000,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  validateInput(input) {
    if (!input?.audio) {
      return { valid: false, error: 'Áudio é obrigatório (ArrayBuffer, Blob ou File)' };
    }
    return { valid: true };
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    const durationSec = Math.min(60, Math.max(5, Math.round((input.audio.byteLength ?? 1000000) / 32000)));

    if (onProgress) onProgress({ stage: 'loading-model', progress: 0.1, message: 'Carregando modelo fake...' });
    await new Promise(r => setTimeout(r, 20));
    if (signal?.aborted) throw new Error('Cancelled');

    if (onProgress) onProgress({ stage: 'transcribing', progress: 0.3, message: 'Transcrevendo...' });
    // Simula tempo proporcional à duração
    await new Promise(r => setTimeout(r, Math.min(200, durationSec * 2)));
    if (signal?.aborted) throw new Error('Cancelled');

    if (onProgress) onProgress({ stage: 'aligning', progress: 0.8, message: 'Alinhando timestamps...' });
    await new Promise(r => setTimeout(r, 20));

    // Gera palavras fake com timestamps realistas
    const words = [];
    const phrases = [
      'O sol nasce sobre o mar',
      'A lira de Apolo guarda o tempo',
      'Este é um teste de legendas',
      'Em português do Brasil',
      'A palavra certa precisa aparecer',
      'No momento certo',
    ];
    let t = 0;
    for (const phrase of phrases) {
      const ws = phrase.split(' ');
      const phraseDur = ws.length * 0.35 + 0.2;
      for (const w of ws) {
        const wDur = 0.25 + Math.random() * 0.2;
        words.push({ word: w, start: t, end: t + wDur, confidence: 0.95 + Math.random() * 0.05 });
        t += wDur;
      }
      t += 0.3; // pausa entre frases
    }
    const totalDur = Math.max(durationSec, t + 1);

    const segments = [];
    let segStart = 0;
    for (const phrase of phrases) {
      const ws = phrase.split(' ');
      const segDur = ws.length * 0.4 + 0.3;
      segments.push({ text: phrase, start: segStart, end: segStart + segDur });
      segStart += segDur + 0.4;
    }

    return {
      ok: true,
      data: {
        text: phrases.join(' '),
        words,
        segments,
        language: input.language || 'pt',
        duration: totalDur,
      },
      costEstimated: 0,
      metadata: { model: 'fake-whisper-small', language: input.language || 'pt', wordCount: words.length },
    };
  }

  async estimateCost(input) {
    return { costEstimated: 0, details: 'Local: custo zero' };
  }

  async checkAvailability() {
    return { available: true, reason: 'Fake Whisper sempre disponível offline' };
  }
}

/* ---------------------------------------------------------------
   Fake Translation Provider
   --------------------------------------------------------------- */
class FakeTranslationProvider extends TranslationProvider {
  constructor() {
    super({
      name: 'fake-translator',
      type: 'translation',
      capabilities: {
        models: ['fake-marian', 'fake-nllb'],
        languages: ['pt', 'en', 'es', 'fr', 'de', 'it'],
        limits: { maxChars: 5000 },
        streaming: false,
      },
      costTable: {
        unit: 'character',
        rates: { 'fake-marian': 0.000001, 'fake-nllb': 0.0000008 },
      },
      timeoutMs: 200,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  validateInput(input) {
    if (!input?.text || !input?.sourceLang || !input?.targetLang) {
      return { valid: false, error: 'Texto, sourceLang e targetLang são obrigatórios' };
    }
    return { valid: true };
  }

  async execute(input) {
    // Tradução fake determinística: apenas prefixa com [TARGET]
    const prefix = { en: '[EN]', es: '[ES]', fr: '[FR]', de: '[DE]', it: '[IT]', pt: '[PT]' };
    const p = prefix[input.targetLang] || `[${input.targetLang.toUpperCase()}]`;
    const translated = `${p} ${input.text}`;

    let words;
    if (input.preserveFormatting) {
      // Mantém estrutura de palavras com timestamps (fake)
      words = input.text.split(' ').map((w, i) => ({
        word: `${p} ${w}`,
        start: i * 0.4,
        end: i * 0.4 + 0.35,
      }));
    }

    return {
      ok: true,
      data: { text: translated, words },
      costEstimated: input.text.length * 0.000001,
      metadata: { model: 'fake-marian', sourceLang: input.sourceLang, targetLang: input.targetLang },
    };
  }

  async checkAvailability() {
    return { available: true };
  }
}

/* ---------------------------------------------------------------
   Fake TTS Provider
   --------------------------------------------------------------- */
class FakeTTSProvider extends TTSProvider {
  constructor() {
    super({
      name: 'fake-tts',
      type: 'tts',
      capabilities: {
        models: ['fake-piper', 'fake-coqui'],
        languages: ['pt', 'en', 'es'],
        limits: { maxChars: 3000 },
        streaming: false,
      },
      costTable: {
        unit: 'character',
        rates: { 'fake-piper': 0.000002, 'fake-coqui': 0.000003 },
      },
      timeoutMs: 500,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  async execute(input) {
    // Gera áudio fake: WAV header + silêncio
    const sampleRate = 22050;
    const duration = Math.max(1, input.text.length * 0.08);
    const samples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    // RIFF header
    view.setUint32(0, 0x52494646, false); // 'RIFF'
    view.setUint32(4, 36 + samples * 2, true);
    view.setUint32(8, 0x57415645, false); // 'WAVE'
    view.setUint32(12, 0x666d7420, false); // 'fmt '
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // 'data'
    view.setUint32(40, samples * 2, true);
    // silence (zeros)

    return {
      ok: true,
      data: { audio: buffer, duration, format: 'wav' },
      costEstimated: input.text.length * 0.000002,
      metadata: { voice: input.voice || 'fake-pt-female', model: 'fake-piper' },
    };
  }

  async checkAvailability() {
    return { available: true };
  }
}

/* ---------------------------------------------------------------
   Fake Image Generation Provider
   --------------------------------------------------------------- */
class FakeImageGenerationProvider extends ImageGenerationProvider {
  constructor() {
    super({
      name: 'fake-image-gen',
      type: 'image-gen',
      capabilities: {
        models: ['fake-sdxl', 'fake-flux'],
        languages: [],
        limits: { maxWidth: 1920, maxHeight: 1920 },
        streaming: false,
      },
      costTable: {
        unit: 'image',
        rates: { 'fake-sdxl': 0.02, 'fake-flux': 0.015 },
      },
      timeoutMs: 1000,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  async execute(input) {
    // Gera PNG 1x1 pixel colorido determinístico baseado no prompt
    const canvas = document.createElement('canvas');
    canvas.width = input.width || 1080;
    canvas.height = input.height || 1920;
    const ctx = canvas.getContext('2d');
    const hue = (input.prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
    ctx.fillStyle = `hsl(${hue}, 70%, 40%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Fake: ${input.prompt.slice(0, 40)}`, canvas.width / 2, canvas.height / 2);

    const blob = await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
    const arrayBuffer = await blob.arrayBuffer();

    return {
      ok: true,
      data: { image: arrayBuffer, mimeType: 'image/png' },
      costEstimated: 0.015,
      metadata: { model: 'fake-sdxl', seed: 12345, width: canvas.width, height: canvas.height },
    };
  }

  async checkAvailability() {
    return { available: true };
  }
}

/* ---------------------------------------------------------------
   Fake Video Generation Provider
   --------------------------------------------------------------- */
class FakeVideoGenerationProvider extends VideoGenerationProvider {
  constructor() {
    super({
      name: 'fake-video-gen',
      type: 'video-gen',
      capabilities: {
        models: ['fake-sora', 'fake-luma', 'fake-runway'],
        languages: [],
        limits: { maxDurationSec: 10, maxWidth: 1080, maxHeight: 1920 },
        streaming: false,
      },
      costTable: {
        unit: 'second',
        rates: { 'fake-sora': 0.5, 'fake-luma': 0.3, 'fake-runway': 0.25 },
      },
      timeoutMs: 2000,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    const duration = Math.min(10, Math.max(1, input.duration || 5));
    const fps = input.fps || 30;
    const frames = duration * fps;

    if (onProgress) onProgress({ stage: 'generating', progress: 0.1, message: 'Gerando frames...' });

    // WebM simples via MediaRecorder (fake rápido)
    const canvas = document.createElement('canvas');
    canvas.width = input.width || 1080;
    canvas.height = input.height || 1920;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(fps);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1000000 });
    const chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    const stopped = new Promise(r => recorder.onstop = r);

    recorder.start(100);
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) { recorder.stop(); throw new Error('Cancelled'); }
      const t = i / fps;
      ctx.fillStyle = `hsl(${Math.floor(t * 60) % 360}, 60%, 30%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '60px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Fake Video ${t.toFixed(1)}s`, canvas.width / 2, canvas.height / 2);
      await new Promise(r => setTimeout(r, 1000 / fps));
      if (onProgress && i % Math.max(1, Math.floor(frames / 10)) === 0) {
        onProgress({ stage: 'generating', progress: 0.1 + 0.8 * (i / frames), message: `Frame ${i}/${frames}` });
      }
    }
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mime });
    const arrayBuffer = await blob.arrayBuffer();

    return {
      ok: true,
      data: { video: arrayBuffer, mimeType: mime },
      costEstimated: duration * 0.25,
      metadata: { model: 'fake-runway', duration, fps, width: canvas.width, height: canvas.height },
    };
  }

  async checkAvailability() {
    return { available: typeof MediaRecorder !== 'undefined' };
  }
}

/* ---------------------------------------------------------------
   Fake Video-to-Video Provider
   --------------------------------------------------------------- */
class FakeVideoToVideoProvider extends VideoToVideoProvider {
  constructor() {
    super({
      name: 'fake-video-to-video',
      type: 'video-to-video',
      capabilities: {
        models: ['fake-ebsynth', 'fake-toonify'],
        languages: [],
        limits: { maxDurationSec: 60, maxWidth: 1920, maxHeight: 1920 },
        streaming: false,
      },
      costTable: {
        unit: 'second',
        rates: { 'fake-ebsynth': 0.1, 'fake-toonify': 0.08 },
      },
      timeoutMs: 3000,
      maxRetries: 0,
      requiresAuth: false,
    });
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    // Apenas copia o vídeo de entrada (passthrough fake)
    if (onProgress) onProgress({ stage: 'processing', progress: 0.5, message: 'Aplicando estilo fake...' });
    await new Promise(r => setTimeout(r, 100));
    if (signal?.aborted) throw new Error('Cancelled');

    return {
      ok: true,
      data: { video: input.video, mimeType: 'video/mp4' },
      costEstimated: 0.05,
      metadata: { model: 'fake-ebsynth', style: input.style, strength: input.strength },
    };
  }

  async checkAvailability() {
    return { available: true };
  }
}

/* ---------------------------------------------------------------
   Fake Social Publish Provider
   --------------------------------------------------------------- */
class FakeSocialPublishProvider extends SocialPublishProvider {
  constructor() {
    super({
      name: 'fake-social-publish',
      type: 'social-publish',
      capabilities: {
        models: [],
        languages: [],
        limits: { platforms: ['youtube', 'tiktok', 'instagram', 'kwai', 'twitter'] },
        streaming: false,
      },
      costTable: { unit: 'post', rates: { default: 0.0 } },
      timeoutMs: 500,
      maxRetries: 0,
      requiresAuth: true,
      requiredEnvVars: ['FAKE_OAUTH_TOKEN'],
    });
  }

  validateInput(input) {
    if (!input?.video || !input?.platform || !input?.credentials) {
      return { valid: false, error: 'Vídeo, platform e credentials (OAuth) são obrigatórios' };
    }
    return { valid: true };
  }

  async execute(input) {
    const postId = `fake_${input.platform}_${Date.now()}`;
    return {
      ok: true,
      data: { postId, url: `https://${input.platform}.com/@fake/${postId}`, publishedAt: new Date() },
      costEstimated: 0,
      metadata: { platform: input.platform, scheduled: !!input.scheduleAt },
    };
  }

  async checkAvailability() {
    return { available: true, reason: 'Fake publisher sempre disponível' };
  }
}

/* ---------------------------------------------------------------
   Registro dos fakes
   --------------------------------------------------------------- */
registerProvider(new FakeLLMProvider());
registerProvider(new FakeTranscriptionProvider());
registerProvider(new FakeTranslationProvider());
registerProvider(new FakeTTSProvider());
registerProvider(new FakeImageGenerationProvider());
registerProvider(new FakeVideoGenerationProvider());
registerProvider(new FakeVideoToVideoProvider());
registerProvider(new FakeSocialPublishProvider());

export {
  FakeLLMProvider,
  FakeTranscriptionProvider,
  FakeTranslationProvider,
  FakeTTSProvider,
  FakeImageGenerationProvider,
  FakeVideoGenerationProvider,
  FakeVideoToVideoProvider,
  FakeSocialPublishProvider,
};