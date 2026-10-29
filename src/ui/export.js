/* ============================================================
   APOLLOCUT — Export Controller
   Renderiza o corte de verdade: canvas (enquadramento + legendas)
   + MediaRecorder (vídeo + áudio do próprio player).
   Sem upload, sem ffmpeg.wasm, sem servidor.
   ============================================================ */

import { drawCaption, drawWatermark, carregarFontes } from '../captions/render.js';

const RATIOS = {
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 900, h: 900 },
  '16:9': { w: 1280, h: 720 },
};

function waitEvent(target, event, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`Falha ao aguardar ${event}`)); };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, done);
      target.removeEventListener('error', fail);
    };
    const timer = setTimeout(fail, timeout);
    target.addEventListener(event, done, { once: true });
    target.addEventListener('error', fail, { once: true });
  });
}

function pickMime() {
  const options = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return options.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

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
    const { exportBtn, exportStart, exportCancel, exportClose, sampleExport } = this.els;

    exportBtn?.addEventListener('click', () => this.openExport());
    exportStart?.addEventListener('click', () => this.startExport());
    exportCancel?.addEventListener('click', () => this.cancel());
    exportClose?.addEventListener('click', () => this.close());
    sampleExport?.addEventListener('change', () => this.updateExportUI());
    window.addEventListener('kit:export', () => this.openExport());
  }

  openExport() {
    if (!this.state.clips.length) {
      this.toast.show('Nenhum corte para exportar', 'error');
      return;
    }
    this.updateExportUI();
    this.overlays.open(this.els.exportOverlay);
  }

  getTargetClip() {
    return this.state.getActiveClip() || this.state.clips[0] || null;
  }

  updateExportUI() {
    const { exportThumb, exportClipTitle, exportClipMeta, exportTag, exportResult, exportProgress } = this.els;
    const clip = this.getTargetClip();
    if (!clip) return;

    if (exportResult) exportResult.hidden = true;
    if (exportProgress) exportProgress.hidden = true;

    this.generateThumbnail(clip.start + 0.1).then((dataUrl) => {
      if (exportThumb && dataUrl) exportThumb.style.backgroundImage = `url("${dataUrl}")`;
    }).catch(() => {});

    if (exportClipTitle) {
      const index = this.state.clips.findIndex((c) => c.id === clip.id) + 1;
      exportClipTitle.textContent = `Corte ${index}`;
    }
    if (exportClipMeta) {
      const shown = this.sampleDuration(clip);
      exportClipMeta.textContent = `${clip.start.toFixed(1)}s–${(clip.start + shown).toFixed(1)}s (${shown.toFixed(1)}s)`;
    }
    if (exportTag) {
      const ratio = this.state.settings.ratio || '9:16';
      exportTag.textContent = `${ratio} • ${RATIOS[ratio]?.w || 720}×${RATIOS[ratio]?.h || 1280}`;
    }
  }

  sampleDuration(clip) {
    return this.els.sampleExport?.checked ? Math.min(12, clip.duration) : clip.duration;
  }

  async generateThumbnail(time) {
    const { previewVideo } = this.els;
    if (!previewVideo || !this.state.url) return '';

    const video = document.createElement('video');
    video.src = this.state.url;
    video.muted = true;
    video.playsInline = true;
    try {
      await waitEvent(video, 'loadeddata');
      video.currentTime = Math.max(0, Math.min(time, (video.duration || 1) - 0.05));
      await waitEvent(video, 'seeked');
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 320, 180);
      return canvas.toDataURL('image/jpeg', 0.8);
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  }

  ensureAudio() {
    const { previewVideo } = this.els;
    if (!previewVideo) return null;
    if (!this.state.audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(previewVideo);
      const dest = ctx.createMediaStreamDestination();
      // O MediaElementSource tira o áudio da saída padrão: devolvemos
      // para os alto-falantes e duplicamos para a gravação.
      source.connect(ctx.destination);
      source.connect(dest);
      this.state.audio = { ctx, source, monitor: ctx.destination, dest };
    }
    if (this.state.audio.ctx.state === 'suspended') {
      this.state.audio.ctx.resume().catch(() => {});
    }
    return this.state.audio;
  }

  async startExport() {
    if (this.state.export.running) return;
    const clip = this.getTargetClip();
    if (!clip) {
      this.toast.show('Nenhum corte para exportar', 'error');
      return;
    }

    const { exportProgress, exportResult, exportStart } = this.els;
    this.state.export.running = true;
    this.state.export.cancel = false;
    if (exportProgress) exportProgress.hidden = false;
    if (exportResult) exportResult.hidden = true;
    if (exportStart) exportStart.disabled = true;

    try {
      const blob = await this.exportClip(clip);
      if (this.state.export.cancel) return;
      this.showExportResult(blob, clip);
      this.toast.show('Corte renderizado');
    } catch (error) {
      if (!this.state.export.cancel) {
        console.error('Export error:', error);
        this.setProgress(0, `Falhou: ${error.message}`);
        this.toast.show('Não foi possível renderizar o corte', 'error');
      }
    } finally {
      this.state.export.running = false;
      if (exportStart) exportStart.disabled = false;
    }
  }

  drawFrame(ctx, video, canvas, clip) {
    const { w, h } = { w: canvas.width, h: canvas.height };
    const focus = Number(this.state.settings.focus ?? 50) / 100;
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const srcAspect = vw / vh;
    const outAspect = w / h;

    const onlyCaptions = this.els.onlyCaptions?.checked;

    if (!onlyCaptions) {
      let sx = 0;
      let sy = 0;
      let sw = vw;
      let sh = vh;
      if (srcAspect > outAspect) {
        // Fonte mais larga: corta nas laterais, guiado pelo enquadramento.
        sw = vh * outAspect;
        sx = (vw - sw) * focus;
      } else {
        sh = vw / outAspect;
        sy = (vh - sh) / 2;
      }

      ctx.fillStyle = '#0c1420';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      // Só legendas: fundo transparente
      ctx.clearRect(0, 0, w, h);
    }

    this.drawCaptions(ctx, video.currentTime, w, h);
    this.drawWatermark(ctx, w, h);
  }

  drawCaptions(ctx, time, w, h) {
    if (!this.els.burnCaptions?.checked || !this.state.cues?.length) return;
    const cue = this.state.cues.find((c) => time >= c.start && time <= c.end);
    if (!cue) return;
    // Motor único: o mesmo desenho da prévia, com o tamanho do quadro exportado.
    drawCaption(ctx, cue, {
      width: w,
      height: h,
      preset: this.state.settings.style,
      time,
      scale: Number(this.state.settings.captionScale) || 1,
      pos: this.state.settings.captionPos || null,
    });
  }

  drawWatermark(ctx, w, h) {
    if (!this.els.brandWatermarkToggle?.checked) return;
    drawWatermark(ctx, w, h);
  }

  async exportClip(clip) {
    const { previewVideo } = this.els;
    if (!previewVideo) throw new Error('player indisponível');
    if (!this.state.url) throw new Error('vídeo não carregado');

    const ratio = this.state.settings.ratio || '9:16';
    const dims = RATIOS[ratio] || RATIOS['9:16'];
    const onlyCaptions = this.els.onlyCaptions?.checked;
    // As fontes locais precisam estar prontas antes do primeiro quadro.
    await carregarFontes();
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d', { alpha: onlyCaptions });

    const start = clip.start;
    const end = clip.start + this.sampleDuration(clip);

    // Áudio do próprio <video>, duplicado para o MediaRecorder (só se não for só legendas).
    const audio = this.ensureAudio();
    const stream = canvas.captureStream(30);
    if (!onlyCaptions && audio?.dest) {
      audio.dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }

    // Para só legendas, força WebM/VP9 que suporta alpha; caso contrário usa pickMime normal.
    const mimeType = onlyCaptions
      ? (window.MediaRecorder?.isTypeSupported?.('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
      : pickMime();
    if (!window.MediaRecorder) throw new Error('MediaRecorder não suportado neste navegador');
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: onlyCaptions ? 0 : 128_000,
    });
    this.recorder = recorder;
    this.state.export.recorder = recorder;

    const chunks = [];
    const recorded = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' })));
      recorder.addEventListener('error', () => reject(new Error('falha do MediaRecorder')));
    });

    // Posiciona no início do corte.
    previewVideo.pause();
    previewVideo.playbackRate = 1;
    if (Math.abs(previewVideo.currentTime - start) > 0.02) {
      previewVideo.currentTime = start;
      await waitEvent(previewVideo, 'seeked');
    }

    this.setProgress(0, 'Renderizando…');
    recorder.start(250);
    previewVideo.muted = false;
    previewVideo.volume = 1;
    await previewVideo.play();

    await new Promise((resolve) => {
      // setTimeout em vez de requestAnimationFrame: rAF é suspenso em abas
      // não pintadas e a exportação ficava travada em 0%.
      const timer = setInterval(() => {
        if (this.state.export.cancel) {
          clearInterval(timer);
          resolve();
          return;
        }
        const time = previewVideo.currentTime;
        try {
          this.drawFrame(ctx, previewVideo, canvas, clip);
        } catch (error) {
          console.warn('export draw:', error);
        }
        const pct = Math.min(100, ((time - start) / Math.max(0.01, end - start)) * 100);
        this.setProgress(pct, `Renderizando ${Math.max(0, time - start).toFixed(1)}s de ${(end - start).toFixed(1)}s…`);
        if (time >= end - 0.03 || previewVideo.ended) {
          clearInterval(timer);
          resolve();
        }
      }, 33);
    });

    previewVideo.pause();
    if (recorder.state !== 'inactive') recorder.stop();

    const blob = await recorded;
    stream.getVideoTracks().forEach((track) => track.stop());
    this.recorder = null;
    if (!blob.size) throw new Error('gravação vazia');
    this.setProgress(100, 'Pronto.');
    return blob;
  }

  setProgress(pct, status) {
    const { exportBar, exportPct, exportStatus } = this.els;
    const rounded = Math.round(Math.max(0, Math.min(100, pct)));
    if (exportBar) {
      exportBar.style.width = `${rounded}%`;
      exportBar.setAttribute('aria-valuenow', String(rounded));
    }
    if (exportPct) exportPct.textContent = `${rounded}%`;
    if (exportStatus) exportStatus.textContent = status;
  }

  showExportResult(blob, clip) {
    const { exportProgress, exportResult, downloadLink, exportFileInfo } = this.els;
    if (exportProgress) exportProgress.hidden = true;
    if (exportResult) exportResult.hidden = false;

    if (this.state.export.url) URL.revokeObjectURL(this.state.export.url);
    const url = URL.createObjectURL(blob);
    this.state.export.url = url;

    if (downloadLink) {
      const index = this.state.clips.findIndex((c) => c.id === clip.id) + 1;
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      downloadLink.href = url;
      downloadLink.download = `apollocut-corte-${index}.${ext}`;
      downloadLink.textContent = 'Baixar corte';
      downloadLink.setAttribute('data-size', String(blob.size));
      downloadLink.setAttribute('data-duration', String(this.sampleDuration(clip)));
    }

    if (exportFileInfo) {
      const mb = (blob.size / 1024 / 1024).toFixed(2);
      const ratio = this.state.settings.ratio || '9:16';
      const dims = RATIOS[ratio] || RATIOS['9:16'];
      const label = blob.type.includes('mp4') ? 'MP4 H.264' : 'WebM';
      exportFileInfo.textContent = `${mb} MB • ${label} ${dims.w}×${dims.h} • ${this.sampleDuration(clip).toFixed(1)}s • ${clip.duration > this.sampleDuration(clip) ? 'amostra' : 'corte inteiro'}`;
    }
  }

  cancel() {
    if (!this.state.export.running) return;
    this.state.export.cancel = true;
    const { previewVideo } = this.els;
    if (previewVideo) previewVideo.pause();
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch (_) { /* já parado */ }
    }
    this.toast.show('Exportação cancelada');
  }

  close() {
    this.cancel();
    this.overlays.close(this.els.exportOverlay);
  }
}
