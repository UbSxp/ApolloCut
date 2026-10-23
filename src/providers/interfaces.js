/**
 * @file Interfaces de provedor desacopladas (Categoria B).
 * Cada interface define: capacidades, custos, validação, timeout, retry, cancelamento, erros em PT-BR.
 * Implementações: local (quando viável), fake (obrigatório p/ testes), real (esqueleto, desativado).
 */

/**
 * @typedef {Object} ProviderCapabilities
 * @property {string[]} models - Modelos suportados
 * @property {string[]} languages - Idiomas suportados (ISO 639-1)
 * @property {Object} limits - Limites por requisição (ex.: maxTokens, maxDurationSec)
 * @property {boolean} streaming - Suporte a streaming de resposta
 */

/**
 * @typedef {Object} ProviderCostTable
 * @property {string} unit - Unidade de cobrança (token, second, image, minute, character)
 * @property {Object.<string, number>} rates - Custo por modelo/qualidade em BRL
 * @property {number} [minimumCharge] - Cobrança mínima por chamada
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} name - Nome único do provedor (ex.: 'whisper-local', 'openai-gpt4', 'fake-llm')
 * @property {string} type - Categoria: 'llm' | 'transcription' | 'translation' | 'tts' | 'image-gen' | 'video-gen' | 'video-to-video' | 'social-publish'
 * @property {ProviderCapabilities} capabilities
 * @property {ProviderCostTable} costTable
 * @property {number} [timeoutMs=120000] - Timeout por requisição
 * @property {number} [maxRetries=2] - Tentativas com backoff exponencial
 * @property {boolean} [requiresAuth=false] - Se precisa de chave/credencial
 * @property {string[]} [requiredEnvVars=[]] - Nomes das variáveis de ambiente necessárias
 */

/**
 * @typedef {Object} ProviderResult<T>
 * @property {boolean} ok
 * @property {T} [data]
 * @property {string} [error] - Mensagem em PT-BR para o usuário
 * @property {string} [errorCode] - Código estável para tratamento programático
 * @property {number} [costEstimated] - Custo estimado em BRL
 * @property {number} [costActual] - Custo real informado pelo provedor (opcional)
 * @property {Object} [metadata] - Metadados extras (tokens usados, duração, etc.)
 */

/**
 * Interface base para todos os provedores.
 * @interface
 */
class BaseProvider {
  /**
   * @param {ProviderConfig} config
   */
  constructor(config) {
    this.config = config;
    this.abortController = null;
  }

  /**
   * Valida entrada antes de chamar o provedor.
   * @param {any} input
   * @returns {{valid: boolean, error?: string}}
   */
  validateInput(input) {
    return { valid: true };
  }

  /**
   * Executa a operação principal do provedor.
   * @param {any} input
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal] - Para cancelamento externo
   * @param {(progress: {stage: string, progress: number, message?: string}) => void} [options.onProgress]
   * @returns {Promise<ProviderResult<any>>}
   */
  async execute(input, options = {}) {
    throw new Error('execute() deve ser implementado pelo provedor concreto');
  }

  /**
   * Estimativa de custo antes de executar.
   * @param {any} input
   * @returns {Promise<{costEstimated: number, details: string}>}
   */
  async estimateCost(input) {
    return { costEstimated: 0, details: 'Custo não calculado' };
  }

  /**
   * Verifica se o provedor está disponível (chave instalada, binário presente, etc.).
   * @returns {Promise<{available: boolean, reason?: string}>}
   */
  async checkAvailability() {
    return { available: true };
  }

  /**
   * Cancela operação em andamento.
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Retry com backoff exponencial.
   * @template T
   * @param {() => Promise<T>} fn
   * @param {number} maxRetries
   * @param {number} baseDelayMs
   * @returns {Promise<T>}
   */
  async withRetry(fn, maxRetries = this.config.maxRetries ?? 2, baseDelayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }
}

/**
 * @typedef {Object} LLMInput
 * @property {string} prompt
 * @property {string} [systemPrompt]
 * @property {number} [maxTokens=2000]
 * @property {number} [temperature=0.3]
 * @property {Object} [responseFormat] - Ex.: { type: 'json_object' }
 */

/**
 * @typedef {Object} LLMOutput
 * @property {string} text
 * @property {Object} [usage] - { promptTokens, completionTokens, totalTokens }
 */

/**
 * Interface para provedor de LLM (análise, pontuação, títulos, descrições).
 * @extends BaseProvider
 */
class LLMProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'llm' });
  }

  /** @param {LLMInput} input */
  async execute(input, options) {
    throw new Error('LLMProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} TranscriptionInput
 * @property {ArrayBuffer|Blob|File} audio - WAV mono 16kHz ou formato aceito
 * @property {string} [language] - ISO 639-1 (ex.: 'pt', 'en'); undefined = auto
 * @property {boolean} [wordTimestamps=true]
 * @property {string} [prompt] - Vocabulário customizado / initial_prompt
 */

/**
 * @typedef {Object} TranscriptionOutput
 * @property {string} text
 * @property {Array<{word: string, start: number, end: number, confidence?: number}>} words
 * @property {Array<{text: string, start: number, end: number}>} segments
 * @property {string} language
 * @property {number} duration
 */

/**
 * Interface para provedor de transcrição (ASR).
 * @extends BaseProvider
 */
class TranscriptionProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'transcription' });
  }

  /** @param {TranscriptionInput} input */
  async execute(input, options) {
    throw new Error('TranscriptionProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} TranslationInput
 * @property {string} text
 * @property {string} sourceLang - ISO 639-1
 * @property {string} targetLang - ISO 639-1
 * @property {boolean} [preserveFormatting=true] - Manter timestamps/estrutura SRT/ASS
 */

/**
 * @typedef {Object} TranslationOutput
 * @property {string} text
 * @property {Array<{word: string, start: number, end: number}>} [words] - Se preserveFormatting
 */

/**
 * Interface para provedor de tradução.
 * @extends BaseProvider
 */
class TranslationProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'translation' });
  }

  /** @param {TranslationInput} input */
  async execute(input, options) {
    throw new Error('TranslationProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} TTSInput
 * @property {string} text
 * @property {string} language - ISO 639-1
 * @property {string} [voice] - ID da voz (ex.: 'pt-BR-Female-1')
 * @property {number} [speed=1.0] - 0.5 a 2.0
 * @property {string} [format='mp3'] - 'mp3' | 'wav' | 'opus'
 */

/**
 * @typedef {Object} TTSOutput
 * @property {ArrayBuffer} audio
 * @property {number} duration
 * @property {string} format
 */

/**
 * Interface para provedor de Text-to-Speech (dublagem).
 * @extends BaseProvider
 */
class TTSProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'tts' });
  }

  /** @param {TTSInput} input */
  async execute(input, options) {
    throw new Error('TTSProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} ImageGenInput
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {number} [width=1080]
 * @property {number} [height=1920]
 * @property {number} [steps=20]
 * @property {number} [guidanceScale=7.5]
 * @property {string} [model]
 * @property {ArrayBuffer} [referenceImage] - Para img2img / ControlNet
 */

/**
 * @typedef {Object} ImageGenOutput
 * @property {ArrayBuffer} image - PNG ou JPEG
 * @property {string} mimeType
 * @property {Object} [metadata] - Seed, parâmetros usados
 */

/**
 * Interface para provedor de geração de imagem.
 * @extends BaseProvider
 */
class ImageGenerationProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'image-gen' });
  }

  /** @param {ImageGenInput} input */
  async execute(input, options) {
    throw new Error('ImageGenerationProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} VideoGenInput
 * @property {string} prompt
 * @property {string} [imagePrompt] - Imagem inicial (base64 ou base64 data URL)
 * @property {number} [duration=5] - Segundos
 * @property {number} [fps=30]
 * @property {number} [width=1080]
 * @property {number} [height=1920]
 * @property {string} [model]
 * @property {string} [aspectRatio='9:16'] - '9:16' | '16:9' | '1:1'
 */

/**
 * @typedef {Object} VideoGenOutput
 * @property {ArrayBuffer} video - MP4/WebM
 * @property {string} mimeType
 * @property {number} duration
 * @property {Object} [metadata]
 */

/**
 * Interface para provedor de geração de vídeo.
 * @extends BaseProvider
 */
class VideoGenerationProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'video-gen' });
  }

  /** @param {VideoGenInput} input */
  async execute(input, options) {
    throw new Error('VideoGenerationProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} VideoToVideoInput
 * @property {ArrayBuffer} video - Vídeo de entrada (MP4/WebM)
 * @property {string} prompt - Descrição da transformação
 * @property {string} [style] - Estilo alvo (ex.: 'anime', 'cinematic', 'pixel-art')
 * @property {boolean} [preserveAudio=true]
 * @property {number} [strength=0.7] - Intensidade da transformação
 */

/**
 * @typedef {Object} VideoToVideoOutput
 * @property {ArrayBuffer} video
 * @property {string} mimeType
 * @property {Object} [metadata]
 */

/**
 * Interface para provedor de vídeo-para-vídeo (troca de personagem/cenário/estilo).
 * @extends BaseProvider
 */
class VideoToVideoProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'video-to-video' });
  }

  /** @param {VideoToVideoInput} input */
  async execute(input, options) {
    throw new Error('VideoToVideoProvider.execute() não implementado');
  }
}

/**
 * @typedef {Object} SocialPublishInput
 * @property {ArrayBuffer} video
 * @property {string} title
 * @property {string} description
 * @property {string[]} [tags]
 * @property {string} platform - 'youtube' | 'tiktok' | 'instagram' | 'kwai' | 'twitter'
 * @property {Object} credentials - Tokens OAuth (não salvos no provedor)
 * @property {Date} [scheduleAt] - Se undefined, publica agora
 * @property {boolean} [isShort=true]
 */

/**
 * @typedef {Object} SocialPublishOutput
 * @property {string} postId
 * @property {string} url
 * @property {Date} publishedAt
 */

/**
 * Interface para provedor de publicação social (APIs oficiais OAuth).
 * @extends BaseProvider
 */
class SocialPublishProvider extends BaseProvider {
  constructor(config) {
    super({ ...config, type: 'social-publish' });
  }

  /** @param {SocialPublishInput} input */
  async execute(input, options) {
    throw new Error('SocialPublishProvider.execute() não implementado');
  }
}

/**
 * Registro de provedores disponíveis (carregado dinamicamente).
 * @type {Map<string, BaseProvider>}
 */
const providerRegistry = new Map();

/**
 * Registra um provedor.
 * @param {BaseProvider} provider
 */
function registerProvider(provider) {
  providerRegistry.set(provider.config.name, provider);
}

/**
 * Obtém provedor por nome.
 * @param {string} name
 * @returns {BaseProvider|undefined}
 */
function getProvider(name) {
  return providerRegistry.get(name);
}

/**
 * Lista provedores por tipo.
 * @param {string} type
 * @returns {BaseProvider[]}
 */
function listProvidersByType(type) {
  return [...providerRegistry.values()].filter(p => p.config.type === type);
}

/**
 * Obtém o provedor padrão para um tipo (primeiro disponível local/fake).
 * @param {string} type
 * @returns {Promise<BaseProvider|null>}
 */
async function getDefaultProvider(type) {
  const providers = listProvidersByType(type);
  for (const p of providers) {
    const { available } = await p.checkAvailability();
    if (available) return p;
  }
  return null;
}

export {
  BaseProvider,
  LLMProvider,
  TranscriptionProvider,
  TranslationProvider,
  TTSProvider,
  ImageGenerationProvider,
  VideoGenerationProvider,
  VideoToVideoProvider,
  SocialPublishProvider,
  registerProvider,
  getProvider,
  listProvidersByType,
  getDefaultProvider,
  providerRegistry,
};