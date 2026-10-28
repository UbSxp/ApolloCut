/* ============================================================
   APOLLOCUT - Cover Controller
   Capa real: quadro do filme + tratamento + titulo + marca.
   ============================================================ */

const PRESETS = {
  noite: { wash: 'rgba(6, 12, 20, 0.45)', text: '#fff8e9', accent: 'rgba(201, 162, 39, 0.9)' },
  marmore: { wash: 'rgba(246, 239, 227, 0.55)', text: '#17130f', accent: 'rgba(23, 19, 15, 0.55)' },
  terracota: { wash: 'rgba(169, 84, 52, 0.45)', text: '#fff8e9', accent: 'rgba(255, 248, 233, 0.85)' },
  aurora: { wash: 'rgba(12, 20, 32, 0.35)', text: '#fff8e9', accent: 'rgba(120, 200, 190, 0.9)' },
};

function dimsFor(ratio) {
  if (ratio === '1:1') return [1080, 1080];
  if (ratio === '16:9') return [1920, 1080];
  return [1080, 1920];
}

function waitReady(video) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('error', done);
      resolve();
    };
    video.addEventListener('loadeddata', done, { once: true });
    video.addEventListener('error', done, { once: true });
    setTimeout(done, 4000);
  });
}

export class CoverController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.timer = 0;
    this.setupCover();
  }

  setupCover() {
    const { coverBtn, coverRandomBtn, coverDownload, coverClose, coverTitle, coverPreset } = this.els;

    coverBtn?.addEventListener('click', () => this.openCover());
    coverRandomBtn?.addEventListener('click', () => this.generateRandomCover());
    coverDownload?.addEventListener('click', () => this.downloadCover());
    coverClose?.addEventListener('click', () => this.close());

    coverTitle?.addEventListener('input', () => this.scheduleRedraw());
    coverPreset?.addEventListener('change', () => this.scheduleRedraw());
  }

  scheduleRedraw() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.generateCoverFromCurrentFrame(), 140);
  }

  openCover() {
    if (!this.state.url) {
      this.toast.show('Carregue um video primeiro', 'error');
      return;
    }
    const { coverTitle, coverSub } = this.els;
    const clip = this.state.getActiveClip();
    if (coverTitle && !coverTitle.value) {
      const cue = clip ? this.state.cues.find((c) => c.end > clip.start && c.start < clip.end) : null;
      coverTitle.value = cue ? String(cue.text).slice(0, 72) : '';
    }
    if (coverSub) {
      const index = clip ? this.state.clips.indexOf(clip) + 1 : 0;
      coverSub.textContent = clip ? `Corte ${index} · ${this.state.settings.ratio || '9:16'}` : 'O filme inteiro';
    }
    this.overlays.open(this.els.coverOverlay);
    this.generateCoverFromCurrentFrame();
  }

  async generateCoverFromCurrentFrame() {
    const { previewVideo, coverCanvas, coverLoading } = this.els;
    if (!previewVideo || !coverCanvas) return;

    if (coverLoading) coverLoading.hidden = false;
    await waitReady(previewVideo);

    const ratio = this.state.settings.ratio || '9:16';
    const [w, h] = dimsFor(ratio);
    coverCanvas.width = w;
    coverCanvas.height = h;
    const ctx = coverCanvas.getContext('2d');

    // Enquadramento igual ao do render (corte guiado pelo foco).
    const focus = Number(this.state.settings.focus ?? 50) / 100;
    const vw = previewVideo.videoWidth || 16;
    const vh = previewVideo.videoHeight || 9;
    const srcAspect = vw / vh;
    const outAspect = w / h;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (srcAspect > outAspect) {
      sw = vh * outAspect;
      sx = (vw - sw) * focus;
    } else {
      sh = vw / outAspect;
      sy = (vh - sh) / 2;
    }

    ctx.fillStyle = '#0c1420';
    ctx.fillRect(0, 0, w, h);
    try {
      ctx.drawImage(previewVideo, sx, sy, sw, sh, 0, 0, w, h);
    } catch (_) {
      // Video ainda sem quadro: fica o fundo do atelie.
    }

    const preset = PRESETS[this.els.coverPreset?.value] || PRESETS.noite;
    this.applyCoverEffects(ctx, w, h, preset);
    this.drawTitle(ctx, w, h, preset);

    this.state.cover.frame = coverCanvas.toDataURL('image/png');
    this.state.cover.time = previewVideo.currentTime;
    if (coverLoading) coverLoading.hidden = true;
  }

  applyCoverEffects(ctx, w, h, preset) {
    ctx.fillStyle = preset.wash;
    ctx.fillRect(0, 0, w, h);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, preset.text === '#17130f' ? 'rgba(246,239,227,0.65)' : 'rgba(0,0,0,0.72)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Moldura discreta do atelie.
    const inset = Math.round(w * 0.045);
    ctx.strokeStyle = preset.accent;
    ctx.lineWidth = Math.max(2, Math.round(w * 0.0025));
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }

  drawTitle(ctx, w, h, preset) {
    const title = String(this.els.coverTitle?.value || '').trim();
    if (!title) return;

    const fontSize = Math.round(w * 0.082);
    ctx.font = `700 ${fontSize}px "Cormorant Garamond", "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = preset.text;

    const maxWidth = w * 0.8;
    const words = title.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    const lineHeight = fontSize * 1.12;
    const baseY = h * 0.8 - ((lines.length - 1) * lineHeight) / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.round(w * 0.02);
    lines.forEach((text, index) => ctx.fillText(text, w / 2, baseY + index * lineHeight));
    ctx.shadowBlur = 0;

    const brand = this.state.settings.brand || 'ApolloCut';
    ctx.font = `600 ${Math.round(w * 0.024)}px "Manrope", "Segoe UI", sans-serif`;
    ctx.fillStyle = preset.accent;
    ctx.fillText(brand.toUpperCase(), w / 2, h * 0.9);
  }

  generateRandomCover() {
    if (!this.state.url) {
      this.toast.show('Carregue um video primeiro', 'error');
      return;
    }
    const { previewVideo } = this.els;
    if (previewVideo && this.state.duration) {
      previewVideo.currentTime = Math.random() * this.state.duration;
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
