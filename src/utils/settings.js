/* ============================================================
   APOLLOCUT — Settings persistence
   ============================================================ */

import { DEFAULT_SETTINGS } from './constants.js';
import { SETTINGS_KEY } from './constants.js';

export async function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        // Validate and merge with defaults
        const settings = { ...DEFAULT_SETTINGS };
        Object.keys(DEFAULT_SETTINGS).forEach(key => {
          if (key in parsed) {
            const val = parsed[key];
            const def = DEFAULT_SETTINGS[key];
            if (typeof def === 'number') {
              settings[key] = Number.isFinite(val) ? val : def;
            } else if (typeof def === 'string') {
              settings[key] = typeof val === 'string' ? val : def;
            } else if (typeof def === 'boolean') {
              settings[key] = typeof val === 'boolean' ? val : def;
            }
          }
        });
        return settings;
      }
    }
  } catch (_) {
    // Ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {
    // Storage not available
  }
}