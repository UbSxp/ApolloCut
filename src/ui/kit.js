/* ============================================================
   APOLLOCUT - Kit Controller
   Ficha de publicacao: titulo, descricao, hashtags, capa e video.
   ============================================================ */

import { fmtTime } from '../utils/helpers.js';
import { setTab } from './tabs.js';

export class KitController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.setupKit();
  }

  setupKit() {
    const { kitBtn, kitClose, kitDownloadCover, kitDownloadTxt, kitExport } = this.els;

    kitBtn?.addEventListener('click', () => this.openKit());
    kitClose?.addEventListener('click', () => this.close());
    kitDownloadCover?.addEventListener('click', () => this.downloadCover());
    kitDownloadTxt?.addEventListener('click', () => this.downloadTxt());
    kitExport?.addEventListener('click', () => this.exportVideo());

    document.querySelectorAll('.js-copy').forEach((btn) => {
      btn.addEventListener('click', () => this.copy(btn.dataset.target));
    });
  }

  openKit() {
    if (!this.state.clips.length) {
      this.toast.show('Gere os cortes na aba I para criar a ficha', 'error');
      setTab(this.state, 'scene');
      return;
    }
    this.generateKit();
    this.overlays.open(this.els.kitOverlay);
  }

  generateKit() {
    const { kitTitle, kitDescription, kitHashtags } = this.els;
    const clips = this.state.clips;
    const brand = this.state.settings.brand || 'ApolloCut';

    const title = `${brand} — ${clips.length} ${clips.length === 1 ? 'corte vertical' : 'cortes verticais'}`;

    const clipLines = clips.map((clip, index) => {
      const cue = this.state.cues.find((c) => c.end > clip.start && c.start < clip.end);
      const label = cue ? String(cue.text).replace(/\s+/g, ' ').trim() : 'sem legenda';
      return `${index + 1}. ${fmtTime(clip.start)}–${fmtTime(clip.end)} (${clip.duration.toFixed(1)}s) — ${label}`;
    });

    const description = [
      'Cortes feitos no ApolloCut, no proprio computador.',
      '',
      ...clipLines,
      '',
      `Total: ${clips.length} ${clips.length === 1 ? 'corte' : 'cortes'} em ${this.state.settings.ratio || '9:16'}.`,
    ].join('\n');

    const tags = ['#Shorts', '#Reels', '#TikTok', '#VerticalVideo', '#ApolloCut'];
    if (brand && brand !== 'ApolloCut') tags.push(`#${brand.replace(/[^\p{L}\p{N}]/gu, '')}`);
    const hashtags = tags.join(' ');

    if (kitTitle) kitTitle.textContent = title;
    if (kitDescription) kitDescription.textContent = description;
    if (kitHashtags) kitHashtags.textContent = hashtags;

    this.state.kit = { title, description, hashtags, clips: clips.map((c) => ({ ...c })) };
  }

  async copy(targetId) {
    const text = document.getElementById(targetId)?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('Copiado');
    } catch (_) {
      this.toast.show('Nao foi possivel copiar; selecione o texto', 'error');
    }
  }

  downloadCover() {
    if (!this.state.cover.frame) {
      this.toast.show('Gere uma capa primeiro (aba III · Capa)', 'error');
      return;
    }
    const link = document.createElement('a');
    link.download = `apollocut-kit-cover-${Date.now()}.png`;
    link.href = this.state.cover.frame;
    link.click();
    this.toast.show('Capa do kit baixada');
  }

  downloadTxt() {
    if (!this.state.kit) this.generateKit();
    if (!this.state.kit) return;

    const content = `${this.state.kit.title}\n\n${this.state.kit.description}\n\n${this.state.kit.hashtags}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `apollocut-kit-${Date.now()}.txt`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.toast.show('Ficha .txt baixada');
  }

  exportVideo() {
    this.overlays.close(this.els.kitOverlay);
    window.dispatchEvent(new CustomEvent('kit:export'));
  }

  close() {
    this.overlays.close(this.els.kitOverlay);
  }
}
