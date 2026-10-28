/* ============================================================
   APOLLOCUT — DOM Utilities
   ============================================================ */

export function $id(id) {
  return document.getElementById(id);
}

export function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toasts';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Notificações');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

export function setupGlobalListeners(controllers) {
  const { state, els, toast, overlays, player, analysis, whisper, cover, export: exportCtrl, kit, settings, captions, clips } = controllers;
  
  // File input
  if (els.fileInput) {
    els.fileInput.addEventListener('change', (e) => handleFileSelect(e, state, els, player, toast));
  }
  
  // Dropzone - click to open file picker
  if (els.dropzone) {
    setupDropzone(els.dropzone, els.fileInput);
    // Make dropzone clickable (but not when clicking the button inside)
    els.dropzone.addEventListener('click', (e) => {
      if (!e.target.closest('button, a')) {
        els.fileInput?.click();
      }
    });
  }
  
  // "Escolher arquivo" buttons - there are multiple on the page
  const pickButtons = document.querySelectorAll('.js-pick');
  pickButtons.forEach(btn => {
    if (els.fileInput) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.fileInput.click();
      });
    }
  });
  
  // Paste file support on dropzone
  if (els.dropzone) {
    els.dropzone.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('video/')) {
            const file = item.getAsFile();
            const dt = new DataTransfer();
            dt.items.add(file);
            els.fileInput.files = dt.files;
            els.fileInput.dispatchEvent(new Event('change'));
            break;
          }
        }
      }
    });
  }
  
  // Also wire up the "Abrir o ateliê" button on landing (opens studio without file)
  if (els.openStudioBtn) {
    els.openStudioBtn.addEventListener('click', () => openStudio(state, els));
  }
  
  // SRT input
  if (els.srtInput) {
    els.srtInput.addEventListener('change', (e) => handleSrtSelect(e, state, els, captions, toast));
  }
  
  // New film button
  if (els.newFilmBtn) {
    els.newFilmBtn.addEventListener('click', () => resetToLanding(state, els));
  }
  
  // Tab switching
  setupTabs(els);
  
  // Settings
  if (els.settingsOverlay) {
    settings.init();
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => handleKeyboard(e, controllers));
  
  // Theme change listener
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    if (state.settings.theme === 'auto') {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    }
  });
}

/**
 * Handle file selection
 */
async function handleFileSelect(event, state, els, player, toast) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-m4v'];
  const isAllowed = allowedTypes.some(t => file.type === t) || 
    ['.mp4', '.mov', '.webm', '.mkv', '.m4v'].some(ext => file.name.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    toast.show('Formato não suportado. Use MP4, MOV, WebM, MKV ou M4V', 'error');
    return;
  }
  
  // Warn for very large files (>5GB)
  const sizeGB = file.size / (1024 * 1024 * 1024);
  if (sizeGB > 5) {
    toast.show(`Arquivo grande (${sizeGB.toFixed(1)} GB). O processamento pode demorar.`, 'warning');
  }
  
  state.file = file;
  state.url = URL.createObjectURL(file);
  state.fileName = file.name;
  state.fileSize = file.size;
  
  // Update UI
  if (els.fileName) els.fileName.textContent = file.name;
  if (els.fileMeta) els.fileMeta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB • ${file.type || 'vídeo'}`;
  
  // Show loading state
  if (els.analysisBadge) {
    els.analysisBadge.classList.add('is-busy');
    els.analysisBadge.classList.remove('is-ready');
    els.analysisBadge.querySelector('span').textContent = 'Carregando...';
  }
  
  // Show studio BEFORE loading: a display:none video can stall metadata loading.
  if (els.landing) els.landing.hidden = true;
  if (els.studioScreen) els.studioScreen.hidden = false;
  document.body.classList.add('studio-open');
  if (els.frameEmpty) els.frameEmpty.hidden = false;

  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => { root.style.scrollBehavior = prevBehavior; });

  try {
    // Resolves on loadedmetadata (preload="metadata" reaches readyState 1).
    await player.loadVideo(state.url);

    if (els.analysisBadge) {
      els.analysisBadge.classList.remove('is-busy');
      els.analysisBadge.classList.add('is-ready');
      els.analysisBadge.querySelector('span').textContent = 'Pronto para analisar';
    }
    if (els.frameEmpty) els.frameEmpty.hidden = true;

    // Sem isto os botões de leitura e transcrição ficavam desabilitados
    // para sempre (nasciam disabled no HTML e ninguém os reabilitava).
    if (els.analyzeBtn) els.analyzeBtn.disabled = false;
    if (els.whisperBtn) els.whisperBtn.disabled = false;

    toast.show('Vídeo carregado com sucesso');
    if (els.fileInput) els.fileInput.value = '';
  } catch (err) {
    if (els.analysisBadge) {
      els.analysisBadge.classList.remove('is-busy');
      els.analysisBadge.querySelector('span').textContent = 'Erro ao carregar';
    }
    toast.show('Erro ao carregar vídeo', 'error');
    console.error('Video load error:', err);
  }
}

/**
 * Setup drag and drop
 */
function setupDropzone(dropzone, fileInput) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
  });
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragging'), false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragging'), false);
  });
  
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      fileInput.files = files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Handle SRT selection
 */
function handleSrtSelect(event, state, els, captions, toast) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const cues = captions.parseSRT(e.target.result);
    state.cues = cues;
    state.cueFileName = file.name;
    state.cueSource = 'srt';
    toast.show('Legendas SRT importadas');
    captions.updateCaptionUI();
  };
  reader.readAsText(file);
}

/**
 * Reset to landing screen
 */
function resetToLanding(state, els) {
  // Revoke object URL
  if (state.url) {
    URL.revokeObjectURL(state.url);
  }
  
  // Reset state
  state.file = null;
  state.url = null;
  state.ready = false;
  state.duration = 0;
  state.width = 0;
  state.height = 0;
  state.size = 0;
  state.clips = [];
  state.activeId = null;
  state.exported = false;
  state.cues = [];
  state.cueFileName = '';
  state.cueSource = null;
  
  // Reset UI
  if (els.previewVideo) {
    els.previewVideo.pause();
    els.previewVideo.removeAttribute('src');
    els.previewVideo.load();
  }
  if (els.frameEmpty) els.frameEmpty.hidden = false;
  if (els.landing) els.landing.hidden = false;
  if (els.studioScreen) els.studioScreen.hidden = true;
  document.body.classList.remove('studio-open');
  if (els.fileInput) els.fileInput.value = '';
  if (els.srtInput) els.srtInput.value = '';
  if (els.fileName) els.fileName.textContent = '';
  if (els.fileMeta) els.fileMeta.textContent = '';
  if (els.analyzeBtn) els.analyzeBtn.disabled = true;
  if (els.whisperBtn) els.whisperBtn.disabled = true;

  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => { root.style.scrollBehavior = prevBehavior; });
}

/**
 * Open studio
 */
function openStudio(state, els) {
  if (els.landing) els.landing.hidden = true;
  if (els.studioScreen) els.studioScreen.hidden = false;
  document.body.classList.add('studio-open');
  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => { root.style.scrollBehavior = prevBehavior; });
}

/**
 * Setup tab switching
 */
function setupTabs(els) {
  const tabs = [
    { btn: els.tabScene, panelId: 'tabScene' },
    { btn: els.tabCaptions, panelId: 'tabCaptions' },
    { btn: els.tabPublish, panelId: 'tabPublish' },
  ];
  
  tabs.forEach(({ btn, panelId }) => {
    if (btn) {
      btn.addEventListener('click', () => {
        tabs.forEach(t => {
          if (t.btn) t.btn.classList.remove('active');
          const sec = document.getElementById(t.panelId);
          if (sec) sec.hidden = true;
        });
        btn.classList.add('active');
        const activeSec = document.getElementById(panelId);
        if (activeSec) activeSec.hidden = false;
      });
    }
  });
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboard(event, controllers) {
  const { state, els, player, analysis, whisper, cover, export: exportCtrl, kit, settings } = controllers;
  
  // Escape closes overlays
  if (event.key === 'Escape') {
    const openOverlay = document.querySelector('.overlay:not([hidden])');
    if (openOverlay) {
      // Find which controller owns this overlay and close it
      if (openOverlay.id === 'analysisOverlay') analysis.cancel();
      else if (openOverlay.id === 'whisperOverlay') whisper.cancel();
      else if (openOverlay.id === 'coverOverlay') cover.close();
      else if (openOverlay.id === 'exportOverlay') exportCtrl.cancel();
      else if (openOverlay.id === 'kitOverlay') kit.close();
      else if (openOverlay.id === 'settingsOverlay') settings.close();
    }
  }
  
  // Space toggles play/pause when video focused
  if (event.key === ' ' && document.activeElement === els.previewVideo) {
    event.preventDefault();
    player.togglePlay();
  }
}