/**
 * @file Esqueletos de provedores REAIS (desativados por padrão).
 * Implementação conforme documentação oficial pública de cada serviço.
 * Só ficam ativos quando o usuário insere a chave correspondente.
 * NUNCA chame APIs pagas durante os testes — use os fakes.
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
   Utilitário comum para provedores reais
   --------------------------------------------------------------- */
function getEnvVar(name) {
  // Em produção, leria de window.__APOLLO_ENV__ ou similar (definido pelo usuário)
  // Aqui apenas retorna undefined para manter desativado
  if (typeof window !== 'undefined' && window.__APOLLO_ENV__) {
    return window.__APOLLO_ENV__[name];
  }
  return undefined;
}

function makeAuthHeaders(apiKey) {
  return { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

/* ---------------------------------------------------------------
   OpenAI LLM Provider (GPT-4, GPT-4o, etc.)
   --------------------------------------------------------------- */
class OpenAILLMProvider extends LLMProvider {
  constructor() {
    super({
      name: 'openai-llm',
      type: 'llm',
      capabilities: {
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        languages: ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh'],
        limits: { maxTokens: 128000 },
        streaming: true,
      },
      costTable: {
        unit: 'token',
        rates: {
          'gpt-4o': 0.000015,      // $0.005/1K input + $0.015/1K output ≈ média
          'gpt-4o-mini': 0.00000075,
          'gpt-4-turbo': 0.00003,
          'gpt-3.5-turbo': 0.0000015,
        },
      },
      timeoutMs: 180000,
      maxRetries: 2,
      requiresAuth: true,
      requiredEnvVars: ['OPENAI_API_KEY'],
    });
  }

  validateInput(input) {
    if (!input?.prompt) return { valid: false, error: 'Prompt é obrigatório' };
    if (input.maxTokens && input.maxTokens > this.config.capabilities.limits.maxTokens) {
      return { valid: false, error: `maxTokens excede limite do modelo (${this.config.capabilities.limits.maxTokens})` };
    }
    return { valid: true };
  }

  async checkAvailability() {
    const apiKey = getEnvVar('OPENAI_API_KEY');
    return { available: !!apiKey, reason: apiKey ? 'Chave configurada' : 'OPENAI_API_KEY não definida' };
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    const apiKey = getEnvVar('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

    const model = input.model || 'gpt-4o-mini';
    const body = {
      model,
      messages: [
        ...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : []),
        { role: 'user', content: input.prompt },
      ],
      max_tokens: input.maxTokens || 2000,
      temperature: input.temperature ?? 0.3,
      ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
    };

    if (onProgress) onProgress({ stage: 'request', progress: 0.1, message: 'Enviando para OpenAI...' });

    const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: makeAuthHeaders(apiKey),
      body: JSON.stringify(body),
    }, this.config.timeoutMs);

    if (onProgress) onProgress({ stage: 'response', progress: 0.5, message: 'Recebendo resposta...' });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`OpenAI ${resp.status}: ${err.error?.message || 'Erro desconhecido'}`);
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    return {
      ok: true,
      data: { text, usage },
      costEstimated: this.estimateTokenCost(usage.prompt_tokens, usage.completion_tokens, model),
      costActual: this.estimateTokenCost(usage.prompt_tokens, usage.completion_tokens, model),
      metadata: { model, provider: 'openai', finishReason: data.choices?.[0]?.finish_reason },
    };
  }

  estimateTokenCost(promptTokens, completionTokens, model) {
    const rate = this.config.costTable.rates[model] || this.config.costTable.rates['gpt-4o-mini'];
    return (promptTokens + completionTokens) * rate;
  }

  async estimateCost(input) {
    const model = input.model || 'gpt-4o-mini';
    const promptTokens = Math.ceil((input.prompt?.length || 0) / 4) + Math.ceil((input.systemPrompt?.length || 0) / 4);
    const completionTokens = input.maxTokens || 2000;
    return { costEstimated: this.estimateTokenCost(promptTokens, completionTokens, model), details: `~${promptTokens + completionTokens} tokens × taxa do ${model}` };
  }
}

/* ---------------------------------------------------------------
   Whisper API Provider (OpenAI Whisper / faster-whisper local seria Categoria A)
   --------------------------------------------------------------- */
class OpenAITranscriptionProvider extends TranscriptionProvider {
  constructor() {
    super({
      name: 'openai-whisper-api',
      type: 'transcription',
      capabilities: {
        models: ['whisper-1'],
        languages: ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'auto'],
        limits: { maxDurationSec: 1800, maxFileSizeMB: 25 },
        streaming: false,
      },
      costTable: { unit: 'minute', rates: { 'whisper-1': 0.006 } }, // $0.006/min
      timeoutMs: 300000,
      maxRetries: 1,
      requiresAuth: true,
      requiredEnvVars: ['OPENAI_API_KEY'],
    });
  }

  async checkAvailability() {
    const apiKey = getEnvVar('OPENAI_API_KEY');
    return { available: !!apiKey, reason: apiKey ? 'Chave configurada' : 'OPENAI_API_KEY não definida' };
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    const apiKey = getEnvVar('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

    // Converte audio para Blob (espera WAV/MP3/WebM)
    const audioBlob = input.audio instanceof Blob ? input.audio : new Blob([input.audio], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    if (input.language && input.language !== 'auto') formData.append('language', input.language);
    if (input.prompt) formData.append('prompt', input.prompt);

    if (onProgress) onProgress({ stage: 'upload', progress: 0.2, message: 'Enviando áudio...' });

    const resp = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    }, this.config.timeoutMs);

    if (onProgress) onProgress({ stage: 'processing', progress: 0.7, message: 'Processando transcrição...' });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`Whisper API ${resp.status}: ${err.error?.message || 'Erro'}`);
    }

    const data = await resp.json();
    const words = (data.words || []).map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    }));
    const segments = (data.segments || []).map(s => ({ text: s.text, start: s.start, end: s.end }));

    return {
      ok: true,
      data: { text: data.text, words, segments, language: data.language, duration: data.duration },
      costEstimated: (data.duration / 60) * 0.006,
      costActual: (data.duration / 60) * 0.006,
      metadata: { model: 'whisper-1', provider: 'openai' },
    };
  }
}

/* ---------------------------------------------------------------
   ElevenLabs TTS Provider
   --------------------------------------------------------------- */
class ElevenLabsTTSProvider extends TTSProvider {
  constructor() {
    super({
      name: 'elevenlabs-tts',
      type: 'tts',
      capabilities: {
        models: ['eleven_multilingual_v2', 'eleven_turbo_v2'],
        languages: ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh'],
        limits: { maxChars: 5000 },
        streaming: true,
      },
      costTable: { unit: 'character', rates: { 'eleven_multilingual_v2': 0.0003, 'eleven_turbo_v2': 0.0001 } },
      timeoutMs: 60000,
      maxRetries: 2,
      requiresAuth: true,
      requiredEnvVars: ['ELEVENLABS_API_KEY'],
    });
  }

  async checkAvailability() {
    const apiKey = getEnvVar('ELEVENLABS_API_KEY');
    return { available: !!apiKey, reason: apiKey ? 'Chave configurada' : 'ELEVENLABS_API_KEY não definida' };
  }

  async execute(input, options) {
    const { signal } = options || {};
    const apiKey = getEnvVar('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY não configurada');

    const voiceId = input.voice || '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
    const model = input.model || 'eleven_multilingual_v2';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const body = {
      text: input.text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: input.speed || 1.0 },
    };

    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify(body),
    }, this.config.timeoutMs);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`ElevenLabs ${resp.status}: ${err.detail?.message || 'Erro'}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const chars = input.text.length;

    return {
      ok: true,
      data: { audio: arrayBuffer, duration: chars * 0.08, format: 'mp3' },
      costEstimated: chars * this.config.costTable.rates[model],
      costActual: chars * this.config.costTable.rates[model],
      metadata: { voice: voiceId, model, provider: 'elevenlabs' },
    };
  }
}

/* ---------------------------------------------------------------
   Replicate Image Generation (SDXL, Flux, etc.)
   --------------------------------------------------------------- */
class ReplicateImageProvider extends ImageGenerationProvider {
  constructor() {
    super({
      name: 'replicate-image',
      type: 'image-gen',
      capabilities: {
        models: ['stability-ai/sdxl', 'black-forest-labs/flux-schnell', 'bytedance/sdxl-lightning-4step'],
        languages: [],
        limits: { maxWidth: 1920, maxHeight: 1920 },
        streaming: false,
      },
      costTable: { unit: 'image', rates: { 'sdxl': 0.035, 'flux-schnell': 0.003, 'sdxl-lightning': 0.002 } },
      timeoutMs: 300000,
      maxRetries: 2,
      requiresAuth: true,
      requiredEnvVars: ['REPLICATE_API_TOKEN'],
    });
  }

  async checkAvailability() {
    const token = getEnvVar('REPLICATE_API_TOKEN');
    return { available: !!token, reason: token ? 'Token configurado' : 'REPLICATE_API_TOKEN não definido' };
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    const token = getEnvVar('REPLICATE_API_TOKEN');
    if (!token) throw new Error('REPLICATE_API_TOKEN não configurado');

    const modelMap = {
      'stability-ai/sdxl': 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      'black-forest-labs/flux-schnell': 'black-forest-labs/flux-schnell',
      'bytedance/sdxl-lightning-4step': 'bytedance/sdxl-lightning-4step',
    };
    const version = modelMap[input.model || 'stability-ai/sdxl'];

    const body = {
      version,
      input: {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt,
        width: input.width,
        height: input.height,
        num_inference_steps: input.steps,
        guidance_scale: input.guidanceScale,
        ...(input.referenceImage ? { image: `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(input.referenceImage)))}` } : {}),
      },
    };

    if (onProgress) onProgress({ stage: 'predict', progress: 0.1, message: 'Iniciando geração no Replicate...' });

    const resp = await fetchWithTimeout('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, this.config.timeoutMs);

    if (!resp.ok) throw new Error(`Replicate ${resp.status}: ${await resp.text()}`);
    const prediction = await resp.json();

    // Poll até concluir
    let result = prediction;
    while (['starting', 'processing'].includes(result.status)) {
      if (signal?.aborted) throw new Error('Cancelled');
      await new Promise(r => setTimeout(r, 2000));
      const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Token ${token}` },
      });
      result = await pollResp.json();
      if (onProgress) onProgress({ stage: 'processing', progress: 0.3 + 0.6 * (result.metrics?.progress || 0), message: 'Gerando imagem...' });
    }

    if (result.status !== 'succeeded') throw new Error(`Replicate falhou: ${result.error || result.status}`);

    // Baixa a imagem
    const imgUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    const imgResp = await fetch(imgUrl);
    const arrayBuffer = await imgResp.arrayBuffer();

    return {
      ok: true,
      data: { image: arrayBuffer, mimeType: 'image/png' },
      costEstimated: this.config.costTable.rates[input.model?.includes('flux') ? 'flux-schnell' : 'sdxl'],
      metadata: { model: input.model, provider: 'replicate', predictionId: result.id },
    };
  }
}

/* ---------------------------------------------------------------
   Replicate Video Generation (SVD, Gen-2, etc.)
   --------------------------------------------------------------- */
class ReplicateVideoProvider extends VideoGenerationProvider {
  constructor() {
    super({
      name: 'replicate-video',
      type: 'video-gen',
      capabilities: {
        models: ['stability-ai/stable-video-diffusion', 'luma/ray-2', 'genmo/mochi-1-preview'],
        languages: [],
        limits: { maxDurationSec: 10, maxWidth: 1080, maxHeight: 1920 },
        streaming: false,
      },
      costTable: { unit: 'second', rates: { 'svd': 0.15, 'ray-2': 0.5, 'mochi': 0.3 } },
      timeoutMs: 600000,
      maxRetries: 1,
      requiresAuth: true,
      requiredEnvVars: ['REPLICATE_API_TOKEN'],
    });
  }

  async checkAvailability() {
    const token = getEnvVar('REPLICATE_API_TOKEN');
    return { available: !!token, reason: token ? 'Token configurado' : 'REPLICATE_API_TOKEN não definido' };
  }

  async execute(input, options) {
    const { signal, onProgress } = options || {};
    const token = getEnvVar('REPLICATE_API_TOKEN');
    if (!token) throw new Error('REPLICATE_API_TOKEN não configurado');

    // Implementação similar ao ReplicateImageProvider, adaptada para vídeo
    // Esqueleto apenas — implementação completa requer tratamento de polling e download de vídeo
    throw new Error('Provedor de vídeo Replicate: implementar polling e download conforme modelo escolhido');
  }
}

/* ---------------------------------------------------------------
   YouTube OAuth Publish Provider
   --------------------------------------------------------------- */
class YouTubePublishProvider extends SocialPublishProvider {
  constructor() {
    super({
      name: 'youtube-oauth',
      type: 'social-publish',
      capabilities: {
        models: [],
        languages: [],
        limits: { platforms: ['youtube'] },
        streaming: false,
      },
      costTable: { unit: 'post', rates: { default: 0.0 } },
      timeoutMs: 120000,
      maxRetries: 1,
      requiresAuth: true,
      requiredEnvVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    });
  }

  async checkAvailability() {
    const cid = getEnvVar('YOUTUBE_CLIENT_ID');
    const csec = getEnvVar('YOUTUBE_CLIENT_SECRET');
    return { available: !!(cid && csec), reason: cid && csec ? 'Credenciais OAuth configuradas' : 'YOUTUBE_CLIENT_ID/SECRET não definidos' };
  }

  async execute(input) {
    // Requer fluxo OAuth completo (não implementado aqui)
    // 1. Trocar refresh_token por access_token
    // 2. Upload resumável do vídeo
    // 3. Inserir metadados (title, description, tags, privacyStatus)
    throw new Error('YouTube OAuth: implementar fluxo completo de autenticação e upload resumável');
  }
}

/* ---------------------------------------------------------------
   Registro condicional (só registra se houver chave)
   --------------------------------------------------------------- */
async function registerRealProvidersIfConfigured() {
  const llm = new OpenAILLMProvider();
  if ((await llm.checkAvailability()).available) registerProvider(llm);

  const whisper = new OpenAITranscriptionProvider();
  if ((await whisper.checkAvailability()).available) registerProvider(whisper);

  const tts = new ElevenLabsTTSProvider();
  if ((await tts.checkAvailability()).available) registerProvider(tts);

  const img = new ReplicateImageProvider();
  if ((await img.checkAvailability()).available) registerProvider(img);

  const vid = new ReplicateVideoProvider();
  if ((await vid.checkAvailability()).available) registerProvider(vid);

  const yt = new YouTubePublishProvider();
  if ((await yt.checkAvailability()).available) registerProvider(yt);
}

export {
  OpenAILLMProvider,
  OpenAITranscriptionProvider,
  ElevenLabsTTSProvider,
  ReplicateImageProvider,
  ReplicateVideoProvider,
  YouTubePublishProvider,
  registerRealProvidersIfConfigured,
};