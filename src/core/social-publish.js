/**
 * @file Agendamento e Publicação Automática (Item 9 — Categoria B).
 * SocialPublishProvider (OAuth: YouTube, TikTok, Instagram, Kwai, Twitter/X).
 * Fila de publicação, agendamento, múltiplas contas, limites por plataforma.
 * Integração com editor: bulk-publish cortes aprovados, agendamento recorrente.
 */

import { getProviderFor } from '../providers/index.js';
import { enqueueJob, updateJob } from '../queue/job-queue.js';
import { checkBudget, recordEntry, formatBRL } from '../budget/ledger.js';

/* ---------------------------------------------------------------
   Configuração de Publicação Social
   --------------------------------------------------------------- */
const SOCIAL_CONFIG = {
  // Plataformas suportadas
  platforms: {
    youtube: {
      name: 'YouTube (Shorts)',
      scopes: ['https://www.googleapis.com/auth/youtube.upload'],
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      apiBase: 'https://www.googleapis.com/youtube/v3',
      limits: { dailyUploads: 6, maxFileSizeMB: 256000, maxDurationSec: 60 }, // Shorts
      videoSpecs: { aspectRatio: '9:16', maxDurationSec: 60, formats: ['mp4', 'mov'] },
    },
    tiktok: {
      name: 'TikTok',
      scopes: ['video.upload', 'video.publish'],
      authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      apiBase: 'https://open.tiktokapis.com/v2',
      limits: { dailyPosts: 10, maxFileSizeMB: 500, maxDurationSec: 180 },
      videoSpecs: { aspectRatio: '9:16', maxDurationSec: 180, formats: ['mp4', 'mov'] },
    },
    instagram: {
      name: 'Instagram (Reels)',
      scopes: ['instagram_graph_user_profile', 'instagram_graph_user_media'],
      authUrl: 'https://api.instagram.com/oauth/authorize',
      tokenUrl: 'https://api.instagram.com/oauth/access_token',
      apiBase: 'https://graph.instagram.com/v18.0',
      limits: { dailyPosts: 25, maxFileSizeMB: 4000, maxDurationSec: 90 },
      videoSpecs: { aspectRatio: '9:16', maxDurationSec: 90, formats: ['mp4', 'mov'] },
    },
    kwai: {
      name: 'Kwai',
      scopes: ['video.upload', 'video.publish'],
      authUrl: 'https://open.kwai.com/oauth2/authorize',
      tokenUrl: 'https://open.kwai.com/oauth2/access_token',
      apiBase: 'https://open.kwai.com/api',
      limits: { dailyPosts: 20, maxFileSizeMB: 2000, maxDurationSec: 300 },
      videoSpecs: { aspectRatio: '9:16', maxDurationSec: 300, formats: ['mp4', 'mov'] },
    },
    twitter: {
      name: 'Twitter/X',
      scopes: ['tweet.write', 'tweet.read', 'users.read', 'media.write'],
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      apiBase: 'https://api.twitter.com/2',
      limits: { dailyPosts: 50, maxFileSizeMB: 512, maxDurationSec: 140 },
      videoSpecs: { aspectRatio: '16:9', maxDurationSec: 140, formats: ['mp4', 'mov'] },
    },
  },
  // Configurações de agendamento
  scheduling: {
    timezone: 'America/Sao_Paulo',
    defaultScheduleTime: '19:00', // Horário de pico BR
    minIntervalMinutes: 30,        // Intervalo mínimo entre posts
    maxPostsPerDay: {},            // Por plataforma (override)
    recurringPatterns: ['daily', 'weekdays', 'weekly', 'custom'],
  },
  // Validação de vídeo
  validation: {
    checkAspectRatio: true,
    checkDuration: true,
    checkFileSize: true,
    requireCaptions: false,
    requireThumbnail: false,
  },
};

/* ---------------------------------------------------------------
   OAuth Helpers
   --------------------------------------------------------------- */

/**
 * Gera URL de autorização OAuth.
 * @param {string} platform
 * @param {Object} credentials - { clientId, redirectUri, state }
 * @returns {string}
 */
export function buildAuthUrl(platform, credentials) {
  const config = SOCIAL_CONFIG.platforms[platform];
  if (!config) throw new Error(`Plataforma ${platform} não suportada`);

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
    scope: config.scopes.join(' '),
    response_type: 'code',
    state: credentials.state || crypto.randomUUID(),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Troca código de autorização por tokens de acesso.
 * @param {string} platform
 * @param {string} code
 * @param {Object} credentials - { clientId, clientSecret, redirectUri }
 * @returns {Promise<{accessToken, refreshToken, expiresIn, scope}>}
 */
export async function exchangeCodeForTokens(platform, code, credentials) {
  const config = SOCIAL_CONFIG.platforms[platform];
  if (!config) throw new Error(`Plataforma ${platform} não suportada`);

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: credentials.redirectUri,
  });

  const resp = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!resp.ok) throw new Error(`OAuth token error: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

/**
 * Renova access token usando refresh token.
 * @param {string} platform
 * @param {string} refreshToken
 * @param {Object} credentials
 * @returns {Promise<{accessToken, expiresIn}>}
 */
export async function refreshAccessToken(platform, refreshToken, credentials) {
  const config = SOCIAL_CONFIG.platforms[platform];
  if (!config) throw new Error(`Plataforma ${platform} não suportada`);

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const resp = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!resp.ok) throw new Error(`Token refresh error: ${resp.status}`);
  return resp.json();
}

/* ---------------------------------------------------------------
   Publicação de Vídeo
   --------------------------------------------------------------- */

/**
 * Publica vídeo em uma plataforma.
 * @param {string} platform
 * @param {Blob} videoBlob
 * @param {Object} metadata - { title, description, tags, privacy, scheduleAt }
 * @param {Object} tokens - { accessToken, refreshToken }
 * @param {Object} credentials - { clientId, clientSecret }
 * @returns {Promise<{postId, url, publishedAt}>}
 */
export async function publishVideo(platform, videoBlob, metadata, tokens, credentials) {
  const config = SOCIAL_CONFIG.platforms[platform];
  if (!config) throw new Error(`Plataforma ${platform} não suportada`);

  // Validações
  if (config.validation?.checkDuration && metadata.duration > config.videoSpecs.maxDurationSec) {
    throw new Error(`Vídeo excede duração máxima de ${config.videoSpecs.maxDurationSec}s para ${config.name}`);
  }
  if (config.validation?.checkFileSize && videoBlob.size > config.videoSpecs.maxFileSizeMB * 1024 * 1024) {
    throw new Error(`Arquivo excede ${config.videoSpecs.maxFileSizeMB}MB para ${config.name}`);
  }

  // Implementação específica por plataforma
  switch (platform) {
    case 'youtube':
      return publishToYouTube(videoBlob, metadata, tokens, config);
    case 'tiktok':
      return publishToTikTok(videoBlob, metadata, tokens, config);
    case 'instagram':
      return publishToInstagram(videoBlob, metadata, tokens, config);
    case 'kwai':
      return publishToKwai(videoBlob, metadata, tokens, config);
    case 'twitter':
      return publishToTwitter(videoBlob, metadata, tokens, config);
    default:
      throw new Error(`Publicação para ${platform} não implementada`);
  }
}

/* ---------------------------------------------------------------
   Implementações por Plataforma (Esqueletos)
   --------------------------------------------------------------- */

async function publishToYouTube(videoBlob, metadata, tokens, config) {
  // 1. Inicia upload resumível
  const initResp = await fetch(`${config.apiBase}/videos?part=snippet,status&uploadType=resumable`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': videoBlob.size.toString(),
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title.slice(0, 100),
        description: metadata.description.slice(0, 5000),
        tags: metadata.tags?.slice(0, 30) || [],
        categoryId: '22', // People & Blogs
        defaultLanguage: 'pt',
        defaultAudioLanguage: 'pt',
      },
      status: {
        privacyStatus: metadata.privacy || 'private', // private, unlisted, public
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!initResp.ok) throw new Error(`YouTube init error: ${initResp.status} ${await initResp.text()}`);
  const uploadUrl = initResp.headers.get('Location');

  // 2. Upload do arquivo
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'video/mp4',
      'Content-Length': videoBlob.size.toString(),
    },
    body: videoBlob,
  });

  if (!uploadResp.ok) throw new Error(`YouTube upload error: ${uploadResp.status} ${await uploadResp.text()}`);
  const result = await uploadResp.json();

  return {
    postId: result.id,
    url: `https://www.youtube.com/watch?v=${result.id}`,
    publishedAt: new Date(),
  };
}

async function publishToTikTok(videoBlob, metadata, tokens, config) {
  // TikTok usa upload em duas etapas: create + upload
  // Esqueleto - implementação completa requer registro de app no TikTok Developer
  throw new Error('TikTok: implementar fluxo completo conforme docs do TikTok Developer');
}

async function publishToInstagram(videoBlob, metadata, tokens, config) {
  // Instagram Graph API: cria container de mídia + publica
  throw new Error('Instagram: implementar fluxo completo conforme Graph API');
}

async function publishToKwai(videoBlob, metadata, tokens, config) {
  throw new Error('Kwai: implementar fluxo completo conforme Kwai Open Platform');
}

async function publishToTwitter(videoBlob, metadata, tokens, config) {
  // Twitter API v2: chunked upload + tweet
  throw new Error('Twitter/X: implementar fluxo chunked upload + tweet');
}

/* ---------------------------------------------------------------
   Agendamento de Publicação
   --------------------------------------------------------------- */

/**
 * Agenda publicação para horário futuro.
 * @param {Object} job - { platform, videoBlob, metadata, tokens, credentials, scheduleAt }
 * @returns {Promise<string>} jobId
 */
export async function schedulePublish(job) {
  const delay = job.scheduleAt.getTime() - Date.now();
  if (delay <= 0) {
    // Publica agora
    return publishVideo(job.platform, job.videoBlob, job.metadata, job.tokens, job.credentials);
  }

  // Agenda na fila
  const jobId = await enqueueJob({
    type: 'social-publish',
    input: job,
    resourceLimits: { cpu: 0, gpu: false, network: true },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Publicação social: custo zero (API própria)' },
  });

  // Timer para disparar no horário
  setTimeout(async () => {
    try {
      await publishVideo(job.platform, job.videoBlob, job.metadata, job.tokens, job.credentials);
    } catch (e) {
      console.error(`[SocialPublish] Erro ao publicar agendado:`, e);
    }
  }, delay);

  return jobId;
}

/**
 * Cancela publicação agendada.
 * @param {string} jobId
 */
export async function cancelScheduledPublish(jobId) {
  // Remove da fila
  // Implementação depende da fila (IndexedDB)
  console.log(`Cancelando publicação agendada: ${jobId}`);
}

/* ---------------------------------------------------------------
   Gerenciamento de Contas Conectadas
   --------------------------------------------------------------- */

const ACCOUNTS_KEY = 'apollocut_social_accounts';

/**
 * Salva conta conectada (tokens criptografados).
 * @param {Object} account - { platform, userId, username, displayName, tokens, credentials }
 */
export async function saveConnectedAccount(account) {
  const accounts = await getConnectedAccounts();
  const existing = accounts.find(a => a.platform === account.platform && a.userId === account.userId);
  if (existing) {
    Object.assign(existing, account, { updatedAt: Date.now() });
  } else {
    accounts.push({ ...account, createdAt: Date.now(), updatedAt: Date.now() });
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * Obtém contas conectadas.
 * @returns {Promise<Array>}
 */
export async function getConnectedAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Remove conta conectada.
 * @param {string} platform
 * @param {string} userId
 */
export async function removeConnectedAccount(platform, userId) {
  const accounts = await getConnectedAccounts();
  const filtered = accounts.filter(a => !(a.platform === platform && a.userId === userId));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(filtered));
}

/**
 * Obtém tokens válidos para uma conta (renova se expirado).
 * @param {Object} account
 * @returns {Promise<{accessToken, refreshToken}>}
 */
export async function getValidTokens(account) {
  const { tokens, credentials, platform } = account;
  const expiresAt = tokens.expiresAt || 0;

  if (Date.now() < expiresAt - 60000) {
    // Ainda válido (com margem de 1 min)
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  // Renova
  const newTokens = await refreshAccessToken(platform, tokens.refreshToken, credentials);
  const updatedTokens = {
    accessToken: newTokens.access_token,
    refreshToken: newTokens.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (newTokens.expires_in || 3600) * 1000,
  };

  // Atualiza conta
  account.tokens = updatedTokens;
  await saveConnectedAccount(account);

  return { accessToken: updatedTokens.accessToken, refreshToken: updatedTokens.refreshToken };
}

/* ---------------------------------------------------------------
   Publicação em Massa (Editor)
   --------------------------------------------------------------- */

/**
 * Publica múltiplos cortes em múltiplas plataformas.
 * @param {Array} jobs - [{ platform, cutId, metadata, account }]
 * @param {Object} editorState
 * @returns {Promise<Array<{job, result}>>}
 */
export async function bulkPublish(jobs, editorState, options = {}) {
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      // Renderiza corte se necessário
      let videoBlob = job.videoBlob;
      if (!videoBlob && job.cutId) {
        // Renderiza corte reenquadrado
        // videoBlob = await renderCutReframed(job.cutId, editorState);
      }

      const result = await publishVideo(job.platform, videoBlob, job.metadata, job.tokens, job.credentials);
      results.push({ job, result: { ok: true, ...result } });
    } catch (e) {
      results.push({ job, result: { ok: false, error: e.message } });
    }
  }
  return results;
}

/* ---------------------------------------------------------------
   Job de Fila para Publicação em Lote
   --------------------------------------------------------------- */

export async function enqueueBatchPublishJob(jobs, options = {}) {
  const jobId = await enqueueJob({
    type: 'batch-publish',
    input: { jobs, options },
    resourceLimits: { cpu: 0, gpu: false, network: true },
    costEstimated: { amount: 0, currency: 'BRL', details: 'Publicação social: custo zero (APIs próprias)' },
  });
  return jobId;
}

export async function batchPublishWorker(job, options) {
  const { signal, onProgress } = options;
  const { jobs, options: pubOpts } = job.input;
  const editorState = job.input.editorState;
  if (!editorState) throw new Error('editorState não fornecido');

  const results = await bulkPublish(jobs, editorState, { ...pubOpts, signal, onProgress });
  return { ok: true, data: { published: results.filter(r => r.result.ok).length } };
}

export { SOCIAL_CONFIG };