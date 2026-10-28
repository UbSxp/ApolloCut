/* ============================================================
   APOLLOCUT — Clips Controller
   Lista de cortes: miniatura real, reproduzir, reordenar, apagar.
   ============================================================ */

import { fmtTime } from '../utils/helpers.js';

const THUMB_W = 320;
const THUMB_H = 180;

function once(target, event) {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('thumb: ' + event)); };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener('error', fail);
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener('error', fail, { once: true });
  });
}

/**
 * Extrai um quadro real do vídeo em `time` (segundos).
 * Usa um <video> descartável para não interferir no player.
 */
export async function captureFrame(url, time) {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await once(video, 'loadeddata');
    const target = Math.max(0, Math.min(time, (video.duration || 1) - 0.05));
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target;
      await once(video, 'seeked');
    }
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    const vw = video.videoWidth || THUMB_W;
    const vh = video.videoHeight || THUMB_H;
    const scale = Math.max(THUMB_W / vw, THUMB_H / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.drawImage(video, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export class ClipController {
  constructor(state, els, toast, player) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.player = player;
    this.thumbs = new Map();
    this.thumbsToken = 0;
    this.setupClips();
  }

  setupClips() {
    const { clipGrid } = this.els;

    if (clipGrid) {
      clipGrid.addEventListener('click', (e) => {
        const clipEl = e.target.closest('[data-clip-id]');
        if (!clipEl) return;
        const clipId = clipEl.dataset.clipId;

        if (e.target.closest('.clip-delete')) this.deleteClip(clipId);
        else if (e.target.closest('.clip-play')) this.playClip(clipId);
        else if (e.target.closest('.clip-up')) this.moveClip(clipId, -1);
        else if (e.target.closest('.clip-down')) this.moveClip(clipId, 1);
        else this.selectClip(clipId);
      });
    }

    window.addEventListener('clips:changed', () => this.renderClipGrid());
  }

  selectClip(clipId) {
    this.state.setActiveClip(clipId);
    this.renderClipGrid();
    this.updateActiveClipUI();
    window.dispatchEvent(new CustomEvent('clip:active'));
  }

  playClip(clipId) {
    const clip = this.state.clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.selectClip(clipId);
    if (this.player) this.player.playRange(clip.start, clip.end);
    else {
      const { previewVideo } = this.els;
      if (!previewVideo) return;
      previewVideo.currentTime = clip.start;
      previewVideo.play().catch(() => {});
    }
  }

  deleteClip(clipId) {
    this.state.snapshot();
    this.state.removeClip(clipId);
    this.toast.show('Corte removido');
    this.renderClipGrid();
    this.updateActiveClipUI();
  }

  moveClip(clipId, delta) {
    const clips = this.state.clips;
    const index = clips.findIndex((c) => c.id === clipId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= clips.length) return;
    this.state.snapshot();
    const [moved] = clips.splice(index, 1);
    clips.splice(target, 0, moved);
    this.renderClipGrid();
    this.updateActiveClipUI();
  }

  renderClipGrid() {
    const { clipGrid, clipsSection } = this.els;
    if (!clipGrid) return;

    clipGrid.innerHTML = '';
    if (clipsSection) clipsSection.hidden = this.state.clips.length === 0;

    this.state.clips.forEach((clip, index) => {
      const card = document.createElement('article');
      card.className = 'clip-card';
      card.dataset.clipId = clip.id;
      if (clip.id === this.state.activeId) card.classList.add('active');

      const thumb = this.thumbs.get(clip.id);
      card.innerHTML = `
        <div class="clip-thumb">
          ${thumb ? `<img alt="" src="${thumb}">` : '<span class="clip-thumb-loading"></span>'}
          <span class="thumb-shade"></span>
          <span class="clip-badges">
            <span class="clip-badge roman">${index + 1}</span>
            <span class="clip-badge">${clip.duration.toFixed(1)}s</span>
          </span>
          <button class="clip-play" type="button" aria-label="Reproduzir corte ${index + 1}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button>
        </div>
        <div class="clip-body">
          <h3>Corte ${index + 1}</h3>
          <p class="clip-meta"><span>${fmtTime(clip.start)}–${fmtTime(clip.end)}</span><i></i><span>${clip.manual ? 'manual' : 'lido'}</span></p>
          <div class="clip-actions">
            <button class="btn btn-line clip-up" type="button" ${index === 0 ? 'disabled' : ''} aria-label="Mover corte ${index + 1} para cima"><svg class="icon" aria-hidden="true"><use href="#i-chevron-down" style="transform:rotate(180deg)"></use></svg></button>
            <button class="btn btn-line clip-down" type="button" ${index === this.state.clips.length - 1 ? 'disabled' : ''} aria-label="Mover corte ${index + 1} para baixo"><svg class="icon" aria-hidden="true"><use href="#i-chevron-down"></use></svg></button>
            <button class="btn btn-line clip-delete" type="button" aria-label="Excluir corte ${index + 1}"><svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>Apagar</button>
          </div>
        </div>
      `;

      clipGrid.appendChild(card);
    });

    this.updateClipsMeta();
    this.loadThumbs();
  }

  async loadThumbs() {
    if (!this.state.url) return;
    const token = ++this.thumbsToken;
    const pending = this.state.clips.filter((c) => !this.thumbs.has(c.id));
    for (const clip of pending) {
      if (token !== this.thumbsToken) return;
      try {
        const dataUrl = await captureFrame(this.state.url, clip.start + 0.1);
        this.thumbs.set(clip.id, dataUrl);
        if (token !== this.thumbsToken) return;
        const thumbEl = this.els.clipGrid?.querySelector(`[data-clip-id="${clip.id}"] .clip-thumb`);
        if (thumbEl) thumbEl.insertAdjacentHTML('afterbegin', `<img alt="" src="${dataUrl}">`);
      } catch (_) {
        // Miniatura é cosmética: falhar aqui não pode quebrar a lista.
      }
    }
  }

  updateClipsMeta() {
    const { clipsMeta } = this.els;
    if (!clipsMeta) return;
    const total = this.state.clips.reduce((sum, c) => sum + c.duration, 0);
    clipsMeta.textContent = `${this.state.clips.length} ${this.state.clips.length === 1 ? 'corte' : 'cortes'} • ${total.toFixed(1)}s no total`;
  }

  updateActiveClipUI() {
    const { activeClipInfo, activeClipTitle, activeClipMeta } = this.els;
    const clip = this.state.getActiveClip();

    if (activeClipInfo) activeClipInfo.hidden = !clip;
    if (clip) {
      const index = this.state.clips.findIndex((c) => c.id === clip.id) + 1;
      if (activeClipTitle) activeClipTitle.textContent = `Corte ${index}`;
      if (activeClipMeta) activeClipMeta.textContent = `${fmtTime(clip.start)}–${fmtTime(clip.end)} (${clip.duration.toFixed(1)}s)`;
    } else {
      if (activeClipTitle) activeClipTitle.textContent = 'Nenhum corte ainda';
      if (activeClipMeta) activeClipMeta.textContent = 'O filme inteiro está em tela.';
    }
  }

  addManualClip(start, end) {
    if (!(end > start)) {
      this.toast.show('O fim precisa ser depois do início', 'error');
      return null;
    }
    this.state.snapshot();
    const clip = {
      id: `clip-${Date.now()}`,
      start,
      end,
      duration: end - start,
      score: 1,
      manual: true,
    };
    this.state.addClip(clip);
    this.state.setActiveClip(clip.id);
    this.toast.show('Corte criado');
    this.renderClipGrid();
    this.updateActiveClipUI();
    return clip;
  }
}
