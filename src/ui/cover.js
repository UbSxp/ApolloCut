/* ============================================================
   APOLLOCUT — Cover Controller
   ============================================================ */

export class CoverController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.setupCover();
  }
  
  setupCover() {
    const { coverBtn, coverOverlay, coverCanvas, coverRandomBtn, coverDownload, coverClose, coverLoading } = this.els;
    
    if (coverBtn) {
      coverBtn.addEventListener('click', () => this.openCover());
    }
    
    if (coverRandomBtn) {
      coverRandomBtn.addEventListener('click', () => this.generateRandomCover());
    }
    
    if (coverDownload) {
      coverDownload.addEventListener('click', () => this.downloadCover());
    }
    
    if (coverClose) {
      coverClose.addEventListener('click', () => this.close());
    }
  }
  
  openCover() {
    if (!this.state.url) {
      this.toast.show('Carregue um vídeo primeiro', 'error');
      return;
    }
    
    this.overlays.open(this.els.coverOverlay);
    this.generateCoverFromCurrentFrame();
  }
  
  async generateCoverFromCurrentFrame() {
    const { previewVideo, coverCanvas, coverLoading } = this.els;
    if (!previewVideo || !coverCanvas) return;
    
    if (coverLoading) coverLoading.hidden = false;
    
    const ctx = coverCanvas.getContext('2d');
    const ratio = this.state.settings.ratio;
    const [w, h] = ratio === '9:16' ? [1080, 1920] : ratio === '1:1' ? [1080, 1080] : [1920, 1080];
    
    coverCanvas.width = w;
    coverCanvas.height = h;
    
    // Draw current video frame
    ctx.drawImage(previewVideo, 0, 0, w, h);
    
    // Apply overlay effects
    this.applyCoverEffects(ctx, w, h);
    
    this.state.cover.frame = coverCanvas.toDataURL('image/png');
    this.state.cover.time = previewVideo.currentTime;
    
    if (coverLoading) coverLoading.hidden = true;
  }
  
  applyCoverEffects(ctx, w, h) {
    // Dark overlay for text readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, w, h);
    
    // Add gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  
  generateRandomCover() {
    if (!this.state.url) {
      this.toast.show('Carregue um vídeo primeiro', 'error');
      return;
    }
    
    const { previewVideo } = this.els;
    if (previewVideo && this.state.duration) {
      const randomTime = Math.random() * this.state.duration;
      previewVideo.currentTime = randomTime;
      
      // Wait for seek then generate
      const onSeeked = () => {
        previewVideo.removeEventListener('seeked', onSeeked);
        this.generateCoverFromCurrentFrame();
      };
      previewVideo.addEventListener('seeked', onSeeked);
    }
  }
  
  downloadCover() {
    if (!this.state.cover.frame) {
      this.toast.show('Gere uma capa primeiro', 'error');
      return;
    }
    
    const link = document.createElement('a');
    link.download = `apollocut-cover-${Date.now()}.png`;
    link.href = this.state.cover.frame;
    link.click();
    
    this.toast.show('Capa baixada');
  }
  
  close() {
    this.overlays.close(this.els.coverOverlay);
  }
}