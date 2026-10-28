/* ============================================================
   APOLLOCUT — Constants
   ============================================================ */

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export const STYLE_NAMES = {
  ode: 'Ode',
  estrofe: 'Estrofe',
  marmore: 'Mármore',
  ditirambo: 'Ditirambo',
};

export const RATIO_DIMS = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};

export const WHISPER_LANGS = {
  pt: 'portuguese',
  en: 'english',
  es: 'spanish',
};

export const WHISPER_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
export const WHISPER_MODEL = 'onnx-community/whisper-small_timestamped';

export const SETTINGS_KEY = 'apollocut.settings.v2';

export const THEME_META = {
  light: '#f6efe3',
  dark: '#0c1420',
};

export const DEFAULT_SETTINGS = Object.freeze({
  length: 60,
  count: 4,
  ratio: '9:16',
  style: 'ode',
  focus: 50,
  lang: 'pt',
  brand: '',
  theme: 'auto',
  ambient: true,
  reducedMotion: false,
  sound: false,
});

export const CFG = Object.freeze({
  MIN_BLOCK_MS: 350,
  MAX_BLOCK_MS: 3500,
  MIN_WORD_ISOLATED_MS: 250,
  LEAD_IN_MS: 60,
  TRAIL_OUT_LONG_PAUSE_MS: 150,
  GAP_BRIDGE_MS: 120,
  MAX_VISIBLE_GAP_MS: 150,
  LONG_SILENCE_HIDE_MS: 600,
  ENERGY_ADJUST_MAX_MS: 150,
  MIN_WORD_DURATION_MS: 40,
  VISIBLE_WIDTH_RATIO: 0.88,
});