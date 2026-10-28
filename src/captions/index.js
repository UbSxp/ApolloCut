/* ============================================================
   APOLLOCUT — Captions Module (ES Module wrapper for lib/captions.js)
   ============================================================ */

// Re-export from the UMD module by loading it globally
// This works because lib/captions.js exposes ApolloCaptions on globalThis

export function getCaptionsAPI() {
  if (typeof globalThis !== 'undefined' && globalThis.ApolloCaptions) {
    return globalThis.ApolloCaptions;
  }
  if (typeof window !== 'undefined' && window.ApolloCaptions) {
    return window.ApolloCaptions;
  }
  throw new Error('ApolloCaptions not loaded. Ensure lib/captions.js is loaded before this module.');
}

export function parseSubtitles(raw) {
  return getCaptionsAPI().parseSubtitles(raw);
}

export function sanitizeTranscript(value) {
  return getCaptionsAPI().sanitizeTranscript(value);
}

export function buildGroupsFromCues(cues, clipStart, clipEnd, options) {
  return getCaptionsAPI().buildGroupsFromCues(cues, clipStart, clipEnd, options);
}

export function groupsFromWhisperChunks(chunks, options) {
  return getCaptionsAPI().groupsFromWhisperChunks(chunks, options);
}

export function distributeWords(text, start, end) {
  return getCaptionsAPI().distributeWords(text, start, end);
}

export function groupWords(words, options) {
  return getCaptionsAPI().groupWords(words, options);
}

export function wordsToGroups(text, start, end, options) {
  return getCaptionsAPI().wordsToGroups(text, start, end, options);
}