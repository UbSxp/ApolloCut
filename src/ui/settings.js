/* ============================================================
   APOLLOCUT — Settings Controller
   ============================================================ */

export class SettingsController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.setupSettings();
  }
  
  setupSettings() {
    const { settingsOverlay, settingsClose, settingsDone, settingsReset, themeChoice, settingsLang, ambientToggle, reducedMotionToggle, soundToggle } = this.els;
    
    // Load current settings into UI
    this.loadSettingsToUI();
    
    if (settingsClose) {
      settingsClose.addEventListener('click', () => this.close());
    }

    // Botão de engrenagem do cabeçalho (estava sem listener).
    document.querySelectorAll('.js-settings').forEach((btn) => {
      btn.addEventListener('click', () => this.open());
    });
    
    if (settingsDone) {
      settingsDone.addEventListener('click', () => this.saveAndClose());
    }
    
    if (settingsReset) {
      settingsReset.addEventListener('click', () => this.resetSettings());
    }
    
    if (themeChoice) {
      // #themeChoice é um grupo de botões (div), não um <select>.
      // O clique é tratado pelo ThemeController.
    }
    
    if (settingsLang) {
      settingsLang.addEventListener('change', (e) => this.updateSetting('lang', e.target.value));
    }
    
    if (ambientToggle) {
      ambientToggle.addEventListener('change', (e) => this.updateSetting('ambient', e.target.checked));
    }
    
    if (reducedMotionToggle) {
      reducedMotionToggle.addEventListener('change', (e) => {
        this.updateSetting('reducedMotion', e.target.checked);
        this.applyReducedMotion(e.target.checked);
      });
    }
    
    if (soundToggle) {
      soundToggle.addEventListener('change', (e) => this.updateSetting('sound', e.target.checked));
    }
    
    // Range inputs for length, count, focus
    ['lenRange', 'countRange', 'focusRange'].forEach(id => {
      const el = this.els[id];
      if (el) {
        el.addEventListener('input', (e) => {
          let key = id.replace('Range', '').toLowerCase();
          if (key === 'len') key = 'length';
          this.updateSetting(key, Number(e.target.value));
          this.updateRangeLabel(key, e.target.value);
        });
      }
    });
    
    // Ratio grid
    if (this.els.ratioGrid) {
      this.els.ratioGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ratio]');
        if (btn) {
          this.updateSetting('ratio', btn.dataset.ratio);
          this.updateRatioUI(btn.dataset.ratio);
        }
      });
    }
    
    // Style grid
    if (this.els.styleGrid) {
      this.els.styleGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-style]');
        if (btn) {
          this.updateSetting('style', btn.dataset.style);
          this.updateStyleUI(btn.dataset.style);
        }
      });
    }
    
    // Brand input
    if (this.els.brandInput) {
      this.els.brandInput.addEventListener('input', (e) => {
        this.updateSetting('brand', e.target.value.slice(0, 32));
      });
    }
  }
  
  init() {
    this.loadSettingsToUI();
  }

  open() {
    this.loadSettingsToUI();
    this.overlays.open(this.els.settingsOverlay);
  }
  
  loadSettingsToUI() {
    const s = this.state.settings;
    
    // Theme
    if (this.els.themeChoice) this.els.themeChoice.value = s.theme;
    
    // Language
    if (this.els.settingsLang) this.els.settingsLang.value = s.lang;
    
    // Toggles
    if (this.els.ambientToggle) this.els.ambientToggle.checked = s.ambient;
    if (this.els.reducedMotionToggle) this.els.reducedMotionToggle.checked = s.reducedMotion;
    if (this.els.soundToggle) this.els.soundToggle.checked = s.sound;
    
    // Ranges
    if (this.els.lenRange) {
      this.els.lenRange.value = s.length;
      this.updateRangeLabel('length', s.length);
    }
    if (this.els.countRange) {
      this.els.countRange.value = s.count;
      this.updateRangeLabel('count', s.count);
    }
    if (this.els.focusRange) {
      this.els.focusRange.value = s.focus;
      this.updateRangeLabel('focus', s.focus);
    }
    
    // Ratio
    this.updateRatioUI(s.ratio);
    
    // Style
    this.updateStyleUI(s.style);
    
    // Brand
    if (this.els.brandInput) this.els.brandInput.value = s.brand || '';
    
    // Apply reduced motion
    this.applyReducedMotion(s.reducedMotion);
  }
  
  updateSetting(key, value) {
    this.state.updateSettings({ [key]: value });
  }
  
  updateRangeLabel(key, value) {
    const labelMap = {
      length: 'lenLabel',
      count: 'countLabel',
      focus: 'focusVal',
    };
    const labelId = labelMap[key];
    if (labelId && this.els[labelId]) {
      const suffix = key === 'length' ? 's' : key === 'focus' ? '%' : '';
      this.els[labelId].textContent = `${value}${suffix}`;
    }
    
    // Update range fill
    const rangeId = key === 'length' ? 'lenRange' : key === 'count' ? 'countRange' : 'focusRange';
    if (this.els[rangeId]) {
      const input = this.els[rangeId];
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
      input.style.setProperty('--p', `${Math.min(100, Math.max(0, pct))}%`);
    }
  }
  
  updateRatioUI(ratio) {
    if (!this.els.ratioGrid) return;
    const buttons = this.els.ratioGrid.querySelectorAll('[data-ratio]');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === ratio);
      btn.setAttribute('aria-pressed', btn.dataset.ratio === ratio);
    });
  }
  
  updateStyleUI(style) {
    if (!this.els.styleGrid) return;
    const buttons = this.els.styleGrid.querySelectorAll('[data-style]');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === style);
      btn.setAttribute('aria-pressed', btn.dataset.style === style);
    });
  }
  
  applyReducedMotion(reduced) {
    document.documentElement.style.setProperty('--t-micro', reduced ? '0ms' : '160ms');
    document.documentElement.style.setProperty('--t-ui', reduced ? '0ms' : '280ms');
    document.documentElement.style.setProperty('--t-screen', reduced ? '0ms' : '420ms');
    document.documentElement.style.setProperty('--t-theme', reduced ? '0ms' : '620ms');
    document.body.classList.toggle('reduce-motion', reduced);
    document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  }
  
  resetSettings() {
    if (confirm('Restaurar todas as configurações para o padrão?')) {
      this.state.resetSettings();
      this.loadSettingsToUI();
      this.toast.show('Configurações restauradas');
    }
  }
  
  saveAndClose() {
    this.toast.show('Configurações salvas');
    this.close();
  }
  
  close() {
    this.overlays.close(this.els.settingsOverlay);
  }
}