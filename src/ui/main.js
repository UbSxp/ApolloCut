/* ============================================================
   APOLLOCUT — UI Module (Main)
   ============================================================ */

import { $id, createToastContainer, setupGlobalListeners } from './dom.js';
import { StateManager } from './state.js';
import { OverlayManager } from './overlays.js';
import { ToastManager } from './toast.js';
import { PlayerController } from './player.js';
import { AnalysisController } from './analysis.js';
import { WhisperController } from './whisper.js';
import { CoverController } from './cover.js';
import { ExportController } from './export.js';
import { KitController } from './kit.js';
import { SettingsController } from './settings.js';
import { CaptionController } from './captions.js';
import { ClipController } from './clips.js';
import { ThemeController } from './theme.js';
import { EditorController } from './editor.js';
import { loadSettings } from '../utils/settings.js';

/**
 * Main UI initialization
 * @param {Object} initialSettings - Settings loaded from localStorage
 */
export async function initUI(initialSettings) {
  // Sem argumentos (index.html/build): lê o que ficou salvo no navegador.
  if (!initialSettings) {
    initialSettings = await loadSettings();
  }
  // Initialize core managers
  const state = new StateManager(initialSettings);
  const toast = new ToastManager();
  const overlays = new OverlayManager();
  
  // Cache DOM elements
  const els = cacheElements();
  
  // Initialize controllers
  const player = new PlayerController(state, els, toast);
  const analysis = new AnalysisController(state, els, toast, overlays);
  const whisper = new WhisperController(state, els, toast, overlays);
  const cover = new CoverController(state, els, toast, overlays);
  const exportCtrl = new ExportController(state, els, toast, overlays);
  const kit = new KitController(state, els, toast, overlays);
  const settings = new SettingsController(state, els, toast, overlays);
  const captions = new CaptionController(state, els, toast);
  const clips = new ClipController(state, els, toast, player);
  const theme = new ThemeController(state, toast);
  const editor = new EditorController(state, els, toast, player, clips);
  
  // Setup global event listeners
  setupGlobalListeners({
    state,
    els,
    toast,
    overlays,
    player,
    analysis,
    whisper,
    cover,
    export: exportCtrl,
    kit,
    settings,
    captions,
    clips,
  });
  
  // Apply initial reduced motion (o tema é aplicado pelo ThemeController)
  applyReducedMotion(state.settings.reducedMotion);
  
  // Show opening screen
  showOpening(state, els);
  
  // Expose for debugging (remove in production)
  window.__APOLLO_DEBUG__ = {
    state,
    els,
    toast,
    overlays,
    player,
    analysis,
    whisper,
    cover,
    export: exportCtrl,
    kit,
    settings,
    captions,
    clips,
    editor,
  };
}

/**
 * Cache all DOM elements by ID
 */
function cacheElements() {
  const ids = `opening openingSkip landing studioScreen studioBack studioBrand newFilmBtn openStudioBtn fileInput srtInput
    dropzone fileName fileMeta studioKind studioStateLabel analysisBadge studioSteps
    frame previewVideo captions frameCaptionNote frameWatermark frameEmpty previewLabel previewFormat
    playBtn seekRange seekMarks timeLabel focusRange focusVal quickCaptionsBtn quickCoverBtn coverBtn kitBtn exportBtn
    markInBtn markOutBtn addClipBtn splitClipBtn deleteClipBtn undoBtn redoBtn markLabel editTools
    lenRange lenLabel countRange countLabel ratioGrid analyzeBtn analysisHint analysisNote
    analysisSummary sumSamples sumSelected sumScore sumNote activeClipInfo activeClipTitle activeClipMeta
    captionStatus captionStatusTitle captionStatusText importSrtBtn whisperBtn styleGrid styleHint
    langSelect brandInput tabScene tabCaptions tabPublish clipsSection clipsMeta clipGrid
    analysisOverlay analysisBar analysisPct analysisStage analysisSheet analysisCounter analysisCancel analysisCancelBtn analysisSub analysisTitle
    whisperOverlay whisperBar whisperPct whisperStage whisperLog whisperWave whisperClip whisperStart whisperCancel whisperClose
    coverOverlay coverCanvas coverTitle coverSub coverPreset coverRandomBtn coverDownload coverClose coverLoading
    exportOverlay exportSub exportThumb exportClipTitle exportClipMeta exportTag burnCaptions sampleExport
    brandWatermarkToggle brandWatermarkLabel exportProgress exportBar exportStatus exportPct exportResult
    exportDone exportFileInfo downloadLink exportStart exportCancel exportClose
    kitOverlay kitTitle kitDescription kitHashtags kitClose kitDownloadCover kitDownloadTxt kitExport
    settingsOverlay settingsClose settingsDone settingsReset themeChoice settingsLang
    ambientToggle reducedMotionToggle soundToggle toasts samplerVideo`;

  const els = {};
  ids.split(/\s+/).filter(Boolean).forEach((id) => {
    els[id] = $id(id);
  });
  return els;
}

/**
 * Apply reduced motion setting to document
 */
function applyReducedMotion(reduced) {
  document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
}

/**
 * Show opening screen and wire Continue button
 */
function showOpening(state, els) {
  // Ensure opening visible
  if (els.opening) {
    els.opening.hidden = false;
    els.opening.setAttribute('aria-hidden', 'false');
  }
  // Ensure landing hidden until continue
  if (els.landing) els.landing.hidden = true;

  if (els.openingSkip) {
    els.openingSkip.addEventListener('click', () => {
      // Animate out
      if (els.opening) {
        els.opening.classList.add('is-leaving');
        els.opening.setAttribute('aria-hidden', 'true');
      }
      const reducedMotion = state.settings?.reducedMotion ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const wait = reducedMotion ? 60 : 560;
      setTimeout(() => {
        if (els.opening) {
          els.opening.hidden = true;
          els.opening.classList.remove('is-leaving');
        }
        if (els.landing) {
          els.landing.hidden = false;
        }
        // Reset scroll instantly: smooth scroll + late layout growth made the
        // page flash at the bottom then jump to the top.
        const root = document.documentElement;
        const prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        requestAnimationFrame(() => { root.style.scrollBehavior = prevBehavior; });
      }, wait);
    }, { once: true });
  }
}