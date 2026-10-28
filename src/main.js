/* ============================================================
   APOLLOCUT — Main entry point (ES Module)
   ============================================================ */

import { initUI } from './ui/main.js';
import { loadSettings, saveSettings } from './utils/settings.js';
import { t } from './i18n/index.js';

export { initUI, t };