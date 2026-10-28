/* ============================================================
   APOLLOCUT — Captions Controller
   ============================================================ */

import { parseSubtitles, groupsFromWhisperChunks, buildGroupsFromCues } from '../captions/index.js';

export class CaptionController {
  constructor(state, els, toast) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.setupCaptions();
  }
  
  setupCaptions() {
    const { importSrtBtn, styleGrid, captionStatus, captionStatusTitle, captionStatusText } = this.els;
    
    if (importSrtBtn) {
      importSrtBtn.addEventListener('click', () => {
        this.els.srtInput?.click();
      });
    }
    
    // Style selection
    if (styleGrid) {
      styleGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-style]');
        if (btn) {
          this.state.updateSettings({ style: btn.dataset.style });
          this.updateStyleUI(btn.dataset.style);
        }
      });
    }
    
    // Listen for Whisper results
    window.addEventListener('whisper:result', (e) => this.onWhisperResult(e.detail));
  }
  
  parseSRT(text) {
    return parseSubtitles(text);
  }
  
  onWhisperResult(detail) {
    const { groups } = detail;
    this.state.cues = groups.map(g => ({
      start: g.start,
      end: g.end,
      text: g.words.map(w => w.text).join(' '),
    }));
    this.state.cueSource = 'whisper';
    this.updateCaptionUI();
    this.toast.show('Legendas do Whisper aplicadas');
  }
  
  updateCaptionUI() {
    const { captionStatus, captionStatusTitle, captionStatusText, styleGrid } = this.els;
    
    if (this.state.cues.length) {
      if (captionStatus) captionStatus.hidden = false;
      if (captionStatusTitle) captionStatusTitle.textContent = 'Legendas carregadas';
      if (captionStatusText) captionStatusText.textContent = `${this.state.cues.length} blocos • Fonte: ${this.state.cueSource}`;
    } else {
      if (captionStatus) captionStatus.hidden = true;
    }
    
    // Update style grid
    if (styleGrid) {
      const buttons = styleGrid.querySelectorAll('[data-style]');
      buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === this.state.settings.style);
        btn.setAttribute('aria-pressed', btn.dataset.style === this.state.settings.style);
      });
    }
  }
  
  updateStyleUI(style) {
    if (!this.els.styleGrid) return;
    const buttons = this.els.styleGrid.querySelectorAll('[data-style]');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === style);
      btn.setAttribute('aria-pressed', btn.dataset.style === style);
    });
  }
  
  /**
   * Get caption groups for current clip
   */
  getGroupsForClip(clip) {
    if (!this.state.cues.length) return [];
    
    return buildGroupsFromCues(this.state.cues, clip.start, clip.end, {
      maxWords: 4,
      maxChars: 28,
    });
  }
  
  /**
   * Render captions on canvas for export
   */
  async renderCaptionsToCanvas(ctx, clip, videoWidth, videoHeight) {
    const groups = this.getGroupsForClip(clip);
    if (!groups.length) return;
    
    const style = this.state.settings.style;
    const styleConfig = this.getStyleConfig(style);
    
    // Calculate font size
    const fontSize = videoHeight * 0.095;
    ctx.font = `${styleConfig.fontWeight} ${fontSize}px "${styleConfig.fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const centerX = videoWidth / 2;
    const centerY = videoHeight * 0.8; // Bottom area
    
    groups.forEach(group => {
      const text = group.words.map(w => w.text).join(' ');
      const y = centerY + (groups.indexOf(group) - groups.length / 2) * fontSize * 1.2;
      
      // Background
      const metrics = ctx.measureText(text);
      const padding = 16;
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = fontSize * 1.2 + padding;
      
      ctx.fillStyle = styleConfig.backgroundColor;
      ctx.fillRect(centerX - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight);
      
      // Text with outline
      ctx.strokeStyle = styleConfig.outlineColor;
      ctx.lineWidth = styleConfig.outlineWidth;
      ctx.strokeText(text, centerX, y);
      
      ctx.fillStyle = styleConfig.textColor;
      ctx.fillText(text, centerX, y);
    });
  }
  
  getStyleConfig(style) {
    const configs = {
      ode: {
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontWeight: '600',
        textColor: 'rgba(255,255,255,1)',
        outlineColor: 'rgba(0,0,0,0.85)',
        outlineWidth: 2.5,
        backgroundColor: 'rgba(0,0,0,0.45)',
      },
      estrofe: {
        fontFamily: 'Manrope, Segoe UI, sans-serif',
        fontWeight: '700',
        textColor: 'rgba(255,215,0,1)',
        outlineColor: 'rgba(0,0,0,0.85)',
        outlineWidth: 3,
        backgroundColor: 'rgba(0,0,0,0.5)',
      },
      marmore: {
        fontFamily: 'Cinzel, Cormorant Garamond, serif',
        fontWeight: '500',
        textColor: 'rgba(255,255,255,1)',
        outlineColor: 'rgba(0,0,0,0.9)',
        outlineWidth: 2,
        backgroundColor: 'rgba(0,0,0,0.4)',
      },
      ditirambo: {
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontWeight: '700',
        textColor: 'rgba(255,100,100,1)',
        outlineColor: 'rgba(0,0,0,0.85)',
        outlineWidth: 2.5,
        backgroundColor: 'rgba(0,0,0,0.45)',
      },
    };
    return configs[style] || configs.ode;
  }
}