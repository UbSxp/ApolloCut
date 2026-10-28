/* ============================================================
   APOLLOCUT — State Manager
   ============================================================ */

import { DEFAULT_SETTINGS } from '../utils/constants.js';

export class StateManager {
  constructor(savedSettings = {}) {
    this.file = null;
    this.url = null;
    this.ready = false;
    this.duration = 0;
    this.width = 0;
    this.height = 0;
    this.size = 0;
    this.clips = [];
    this.activeId = null;
    this.exported = false;
    this.cues = [];
    this.cueFileName = '';
    this.cueSource = null;
    this.analysis = { running: false, cancel: false, samples: [], total: 0, done: 0 };
    this.audio = { ctx: null, source: null, monitor: null, dest: null };
    this.capture = { running: false, cancel: false, finish: null, modelPct: 0 };
    this.whisper = { pipe: null, loading: null, lastProgress: -1 };
    this.export = { running: false, cancel: false, url: null, recorder: null, actx: null };
    this.cover = { frame: null, time: 0, token: 0 };
    this.kit = null;
    this.ui = { tab: 'scene', lastFocus: null };
    this.loadToken = 0;
    this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
    this.captionView = { group: -1, clipId: null, ref: null };
    this.playerRaf = 0;
  }
  
  /**
   * Update settings and persist
   */
  updateSettings(partial) {
    this.settings = { ...this.settings, ...partial };
    this.persistSettings();
  }
  
  /**
   * Persist settings to localStorage
   */
  persistSettings() {
    try {
      localStorage.setItem('apollocut.settings.v2', JSON.stringify(this.settings));
    } catch (_) {
      // Storage not available
    }
  }
  
  /**
   * Reset to defaults
   */
  resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.persistSettings();
  }
  
  /**
   * Get current clip
   */
  getActiveClip() {
    return this.clips.find(c => c.id === this.activeId) || this.clips[0] || null;
  }
  
  /**
   * Set active clip
   */
  setActiveClip(clipId) {
    this.activeId = clipId;
  }
  
  /**
   * Add clip
   */
  addClip(clip) {
    this.clips.push(clip);
  }
  
  /**
   * Remove clip
   */
  removeClip(clipId) {
    this.clips = this.clips.filter(c => c.id !== clipId);
    if (this.activeId === clipId) {
      this.activeId = this.clips[0]?.id || null;
    }
  }
  
  /**
   * Clear all clips
   */
  clearClips() {
    this.clips = [];
    this.activeId = null;
  }
}