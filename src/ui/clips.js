/* ============================================================
   APOLLOCUT — Clips Controller
   ============================================================ */

import { fmtTime } from '../utils/helpers.js';

export class ClipController {
  constructor(state, els, toast) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.setupClips();
  }
  
  setupClips() {
    const { clipGrid, clipsSection } = this.els;
    
    // Clip grid delegation
    if (clipGrid) {
      clipGrid.addEventListener('click', (e) => {
        const clipEl = e.target.closest('[data-clip-id]');
        if (!clipEl) return;
        
        const clipId = clipEl.dataset.clipId;
        
        if (e.target.closest('.clip-delete')) {
          this.deleteClip(clipId);
        } else if (e.target.closest('.clip-play')) {
          this.playClip(clipId);
        } else {
          this.selectClip(clipId);
        }
      });
    }
  }
  
  selectClip(clipId) {
    this.state.setActiveClip(clipId);
    this.renderClipGrid();
    this.updateActiveClipUI();
  }
  
  playClip(clipId) {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (clip && this.els.previewVideo) {
      this.els.previewVideo.currentTime = clip.start;
      this.els.previewVideo.play().catch(() => {});
    }
  }
  
  deleteClip(clipId) {
    this.state.removeClip(clipId);
    this.renderClipGrid();
    this.updateActiveClipUI();
    this.toast.show('Corte removido');
  }
  
  renderClipGrid() {
    const { clipGrid } = this.els;
    if (!clipGrid) return;
    
    clipGrid.innerHTML = '';
    
    this.state.clips.forEach((clip, index) => {
      const clipEl = document.createElement('div');
      clipEl.className = 'clip-item';
      clipEl.dataset.clipId = clip.id;
      if (clip.id === this.state.activeId) clipEl.classList.add('active');
      
      clipEl.innerHTML = `
        <div class="clip-thumb" style="background-image: url('${this.generateThumbnailDataUrl(clip.start)}')"></div>
        <div class="clip-info">
          <span class="clip-number">${index + 1}</span>
          <span class="clip-time">${fmtTime(clip.start)}–${fmtTime(clip.end)}</span>
          <span class="clip-duration">${clip.duration.toFixed(1)}s</span>
        </div>
        <button class="clip-play" aria-label="Reproduzir corte ${index + 1}">▶</button>
        <button class="clip-delete" aria-label="Excluir corte ${index + 1}">×</button>
      `;
      
      clipGrid.appendChild(clipEl);
    });
    
    // Update clips meta
    this.updateClipsMeta();
  }
  
  generateThumbnailDataUrl(time) {
    // This would be async in real implementation
    // For now return placeholder
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect fill="%23333"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="12">Preview</text></svg>';
  }
  
  updateClipsMeta() {
    const { clipsMeta } = this.els;
    if (!clipsMeta) return;
    
    const totalDuration = this.state.clips.reduce((sum, c) => sum + c.duration, 0);
    clipsMeta.textContent = `${this.state.clips.length} cortes • ${totalDuration.toFixed(1)}s total`;
  }
  
  updateActiveClipUI() {
    const { activeClipInfo, activeClipTitle, activeClipMeta } = this.els;
    const clip = this.state.getActiveClip();
    
    if (activeClipInfo) activeClipInfo.hidden = !clip;
    if (clip) {
      const index = this.state.clips.findIndex(c => c.id === clip.id) + 1;
      if (activeClipTitle) activeClipTitle.textContent = `Corte ${index}`;
      if (activeClipMeta) activeClipMeta.textContent = `${fmtTime(clip.start)}–${fmtTime(clip.end)} (${clip.duration.toFixed(1)}s)`;
    } else {
      if (activeClipTitle) activeClipTitle.textContent = '—';
      if (activeClipMeta) activeClipMeta.textContent = '—';
    }
  }
  
  /**
   * Add manual clip from current player position
   */
  addManualClip(start, end) {
    const clip = {
      id: `clip-${Date.now()}`,
      start,
      end,
      duration: end - start,
      score: 1.0,
      manual: true,
    };
    this.state.addClip(clip);
    this.renderClipGrid();
    this.toast.show('Corte manual adicionado');
  }
}