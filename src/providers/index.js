/**
 * @file Registro central de provedores.
 * Carrega fakes por padrão, opcionalmente carrega reais se chaves existirem.
 * Exporta funções para o app consumir.
 */

import {
  registerProvider,
  getProvider,
  listProvidersByType,
  getDefaultProvider,
  providerRegistry,
} from './interfaces.js';

// Importa fakes (sempre disponíveis)
import './fake-providers.js';

// Importa reais (registro condicional)
import { registerRealProvidersIfConfigured } from './real-providers.js';

let initialized = false;

/**
 * Inicializa o registro: fakes + reais (se configurados).
 * Deve ser chamado uma vez no bootstrap do app.
 * @returns {Promise<void>}
 */
export async function initializeProviders() {
  if (initialized) return;
  await registerRealProvidersIfConfigured();
  initialized = true;
  console.log('[Providers] Registrados:', [...providerRegistry.keys()].join(', '));
}

/**
 * Obtém provedor por tipo e nome (ou padrão).
 * @param {string} type - 'llm' | 'transcription' | 'translation' | 'tts' | 'image-gen' | 'video-gen' | 'video-to-video' | 'social-publish'
 * @param {string} [name] - Nome específico; se omitido, usa o padrão disponível
 * @returns {Promise<BaseProvider|null>}
 */
export async function getProviderFor(type, name) {
  await initializeProviders();
  if (name) return getProvider(name);
  return getDefaultProvider(type);
}

/**
 * Lista provedores disponíveis por tipo.
 * @param {string} type
 * @returns {Promise<Array<{name: string, config: ProviderConfig, available: boolean}>>}
 */
export async function listAvailableProviders(type) {
  await initializeProviders();
  const providers = listProvidersByType(type);
  const results = [];
  for (const p of providers) {
    const { available, reason } = await p.checkAvailability();
    results.push({ name: p.config.name, config: p.config, available, reason });
  }
  return results;
}

/**
 * Estimativa de custo unificada.
 * @param {string} type
 * @param {string} providerName
 * @param {any} input
 * @returns {Promise<{costEstimated: number, details: string}>}
 */
export async function estimateCost(type, providerName, input) {
  const provider = getProvider(providerName);
  if (!provider) throw new Error(`Provedor ${providerName} não encontrado`);
  return provider.estimateCost(input);
}

/**
 * Executa operação com provedor específico.
 * @param {string} type
 * @param {string} providerName
 * @param {any} input
 * @param {Object} [options]
 * @returns {Promise<ProviderResult<any>>}
 */
export async function executeWithProvider(type, providerName, input, options) {
  const provider = getProvider(providerName);
  if (!provider) throw new Error(`Provedor ${providerName} não encontrado`);
  const { available, reason } = await provider.checkAvailability();
  if (!available) throw new Error(`Provedor indisponível: ${reason}`);
  return provider.execute(input, options);
}

export { providerRegistry, registerProvider };