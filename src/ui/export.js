/* ============================================================
   APOLLOCUT — Export Controller
   ============================================================ */

export class ExportController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.recorder = null;
    this.setupExport();
  }
  
  setupExport() {
    const { exportBtn, exportOverlay, exportStart, exportCancel, exportClose, burnCaptions, exportProgress, exportBar, exportStatus, exportPct, exportResult, downloadLink } = this.els;
    
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.openExport());
    }
    
    if (exportStart) {
      exportStart.addEventListener('click', () => this.startExport());
    }
    
    if (exportCancel) {
      exportCancel.addEventListener('click', () => this.cancel());
    }
    
    if (exportClose) {
      exportClose.addEventListener('click', () => this.close());
    }
  }
  
  openExport() {
    if (!this.state.clips.length) {
      this.toast.show('Nenhum corte para exportar', 'error');
      return;
    }
    
    this.updateExportUI();
    this.overlays.open(this.els.exportOverlay);
  }
  
  updateExportUI() {
    const { exportThumb, exportClipTitle, exportClipMeta } = this.els;
    const clip = this.state.getActiveClip();
    
    if (clip && exportThumb) {
      // Generate thumbnail from clip start
      this.generateThumbnail(clip.start).then(dataUrl => {
        exportThumb.src = dataUrl;
      });
    }
    
    if (clip && exportClipTitle) {
      const index = this.state.clips.findIndex(c => c.id === clip.id) + 1;
      exportClipTitle.textContent = `Corte ${index}`;
    }
    
    if (clip && exportClipMeta) {
      exportClipMeta.textContent = `${clip.start.toFixed(1)}s–${clip.end.toFixed(1)}s (${clip.duration.toFixed(1)}s)`;
    }
  }
  
  async generateThumbnail(time) {
    const { previewVideo } = this.els;
    if (!previewVideo) return '';
    
    return new Promise(resolve => {
      const onSeeked = () => {
        previewVideo.removeEventListener('seeked', onSeeked);
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(previewVideo, 0, 0, 320, 180);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      previewVideo.addEventListener('seeked', onSeeked);
      previewVideo.currentTime = time;
    });
  }
  
  async startExport() {
    if (this.state.export.running) return;
    if (!this.state.clips.length) {
      this.toast.show('Nenhum corte para exportar', 'error');
      return;
    }
    
    this.state.export.running = true;
    this.state.export.cancel = false;
    
    const { exportProgress, exportBar, exportStatus, exportPct, exportResult, downloadLink } = this.els;
    
    exportProgress.hidden = false;
    exportResult.hidden = true;
    
    this.toast.show('Exportação iniciada');
    
    try {
      await this.exportAllClips();
      
      if (!this.state.export.cancel) {
        this.toast.show('Exportação concluída');
        this.showExportResult();
      }
    } catch (error) {
      if (!this.state.export.cancel) {
        this.toast.show('Erro na exportação', 'error');
        console.error('Export error:', error);
      }
    } finally {
      this.state.export.running = false;
    }
  }
  
  async exportAllClips() {
    const { exportBar, exportStatus, exportPct } = this.els;
    const clips = this.state.clips;
    const burnCaptions = this.els.burnCaptions?.checked ?? false;
    
    for (let i = 0; i < clips.length; i++) {
      if (this.state.export.cancel) break;
      
      const clip = clips[i];
      this.updateExportProgress(i + 1, clips.length, `Exportando corte ${i + 1}/${clips.length}...`);
      
      await this.exportClip(clip, burnCaptions);
    }
  }
  
  async exportClip(clip, burnCaptions) {
    // This is a simplified export - in reality would use MediaRecorder or WebCodecs
    // For now, we'll just simulate the export
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In real implementation:
    // 1. Seek video to clip.start
    // 2. Start MediaRecorder
    // 3. Play video segment
    // 4. Stop recorder and save blob
    // 5. If burnCaptions, overlay captions on canvas
  }
  
  updateExportProgress(current, total, status) {
    const { exportBar, exportStatus, exportPct } = this.els;
    const pct = (current / total) * 100;
    
    if (exportBar) exportBar.style.width = `${pct}%`;
    if (exportPct) exportPct.textContent = `${Math.round(pct)}%`;
    if (exportStatus) exportStatus.textContent = status;
  }
  
  showExportResult() {
    const { exportProgress, exportResult, downloadLink } = this.els;
    
    exportProgress.hidden = true;
    exportResult.hidden = false;
    
    // In real implementation, this would be a zip file or multiple files
    if (downloadLink) {
      downloadLink.href = '#';
      downloadLink.textContent = 'Download (simulado)';
    }
  }
  
  cancel() {
    this.state.export.cancel = true;
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
    }
    this.toast.show('Exportação cancelada');
  }
  
  close() {
    this.overlays.close(this.els.exportOverlay);
  }
}