/* ============================================================
   APOLLOCUT — Kit Controller
   ============================================================ */

export class KitController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.setupKit();
  }
  
  setupKit() {
    const { kitBtn, kitOverlay, kitClose, kitDownloadCover, kitDownloadTxt, kitExport } = this.els;
    
    if (kitBtn) {
      kitBtn.addEventListener('click', () => this.openKit());
    }
    
    if (kitClose) {
      kitClose.addEventListener('click', () => this.close());
    }
    
    if (kitDownloadCover) {
      kitDownloadCover.addEventListener('click', () => this.downloadCover());
    }
    
    if (kitDownloadTxt) {
      kitDownloadTxt.addEventListener('click', () => this.downloadTxt());
    }
    
    if (kitExport) {
      kitExport.addEventListener('click', () => this.exportKit());
    }
  }
  
  openKit() {
    if (!this.state.clips.length) {
      this.toast.show('Nenhum corte para criar kit', 'error');
      return;
    }
    
    this.generateKit();
    this.overlays.open(this.els.kitOverlay);
  }
  
  generateKit() {
    const { kitTitle, kitDescription, kitHashtags } = this.els;
    const clips = this.state.clips;
    const brand = this.state.settings.brand || 'ApolloCut';
    
    if (kitTitle) {
      kitTitle.value = `${brand} - ${clips.length} Cortes Verticais`;
    }
    
    if (kitDescription) {
      const descriptions = clips.map((c, i) => 
        `${i + 1}. ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s (${c.duration.toFixed(1)}s) — Score: ${c.score.toFixed(2)}`
      ).join('\n');
      kitDescription.value = `Kit gerado automaticamente pelo ApolloCut\n\n${descriptions}\n\nTotal: ${clips.length} cortes`;
    }
    
    if (kitHashtags) {
      const tags = ['#Shorts', '#Reels', '#TikTok', '#VerticalVideo', '#ApolloCut'];
      if (brand) tags.push(`#${brand.replace(/\s+/g, '')}`);
      kitHashtags.value = tags.join(' ');
    }
    
    this.state.kit = {
      title: kitTitle?.value || '',
      description: kitDescription?.value || '',
      hashtags: kitHashtags?.value || '',
      clips: clips.map(c => ({ ...c })),
    };
  }
  
  downloadCover() {
    if (!this.state.cover.frame) {
      this.toast.show('Gere uma capa primeiro', 'error');
      return;
    }
    
    const link = document.createElement('a');
    link.download = `apollocut-kit-cover-${Date.now()}.png`;
    link.href = this.state.cover.frame;
    link.click();
    
    this.toast.show('Capa do kit baixada');
  }
  
  downloadTxt() {
    if (!this.state.kit) return;
    
    const content = `${this.state.kit.title}\n\n${this.state.kit.description}\n\n${this.state.kit.hashtags}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = `apollocut-kit-${Date.now()}.txt`;
    link.href = url;
    link.click();
    
    URL.revokeObjectURL(url);
    this.toast.show('Arquivo TXT do kit baixado');
  }
  
  exportKit() {
    // This would trigger a full export of all clips + metadata
    this.toast.show('Exportação do kit iniciada (simulado)');
    // In real implementation: create zip with all clips, cover, txt, metadata
  }
  
  close() {
    this.overlays.close(this.els.kitOverlay);
  }
}