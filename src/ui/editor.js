/* ============================================================
   APOLLOCUT — Editor de cortes
   Marca início/fim, cria, divide, apaga, desfaz, reenquadra.
   ============================================================ */

import { fmtTime } from '../utils/helpers.js';

const RATIO_CLASS = { '9:16': 'r916', '1:1': 'r11', '16:9': 'r169' };

export class EditorController {
  constructor(state, els, toast, player, clips) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.player = player;
    this.clips = clips;
    this.in = null;
    this.out = null;
    this.setup();
  }

  setup() {
    const { markInBtn, markOutBtn, addClipBtn, splitClipBtn, deleteClipBtn, undoBtn, redoBtn, focusRange, ratioGrid } = this.els;

    markInBtn?.addEventListener('click', () => this.markIn());
    markOutBtn?.addEventListener('click', () => this.markOut());
    addClipBtn?.addEventListener('click', () => this.addClip());
    splitClipBtn?.addEventListener('click', () => this.split());
    deleteClipBtn?.addEventListener('click', () => this.deleteActive());
    undoBtn?.addEventListener('click', () => this.undo());
    redoBtn?.addEventListener('click', () => this.redo());

    focusRange?.addEventListener('input', (e) => {
      this.state.updateSettings({ focus: Number(e.target.value) });
      this.applyFocus();
    });

    ratioGrid?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ratio]');
      if (!btn) return;
      this.state.updateSettings({ ratio: btn.dataset.ratio });
      this.applyRatio();
    });

    document.addEventListener('keydown', (e) => this.onKey(e));

    window.addEventListener('clips:changed', () => {
      this.updateMarkLabel();
      this.applyRatio();
    });
    window.addEventListener('clip:active', () => this.updateMarkLabel());

    this.applyRatio();
    this.applyFocus();
    this.updateMarkLabel();
  }

  onKey(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!this.state.clips.length) return;
      e.preventDefault();
      this.deleteActive();
      return;
    }
    if (e.key.toLowerCase() === 'i') this.markIn();
    if (e.key.toLowerCase() === 'o') this.markOut();
    if (e.key.toLowerCase() === 's') this.split();
  }

  currentTime() {
    return this.els.previewVideo?.currentTime || 0;
  }

  markIn() {
    this.in = this.currentTime();
    if (this.out !== null && this.out <= this.in) this.out = null;
    this.updateMarkLabel();
    this.toast.show(`Início em ${fmtTime(this.in)}`);
  }

  markOut() {
    this.out = this.currentTime();
    if (this.in !== null && this.out <= this.in) {
      this.in = null;
      this.toast.show('O fim precisa ser depois do início', 'error');
    }
    this.updateMarkLabel();
    if (this.in !== null) this.toast.show(`Fim em ${fmtTime(this.out)}`);
  }

  updateMarkLabel() {
    const { markLabel } = this.els;
    if (!markLabel) return;
    if (this.in === null && this.out === null) {
      markLabel.textContent = 'Marca: —';
    } else {
      const a = this.in === null ? '—' : fmtTime(this.in);
      const b = this.out === null ? '—' : fmtTime(this.out);
      markLabel.textContent = `Marca: ${a} → ${b}`;
    }
  }

  addClip() {
    if (!this.state.url) {
      this.toast.show('Carregue um vídeo primeiro', 'error');
      return;
    }
    const start = this.in;
    const end = this.out;
    if (start === null || end === null) {
      this.toast.show('Marque o início e o fim do corte', 'error');
      return;
    }
    const clip = this.clips.addManualClip(start, end);
    if (clip) {
      this.in = null;
      this.out = null;
      this.updateMarkLabel();
    }
  }

  split() {
    const clip = this.state.getActiveClip();
    const time = this.currentTime();
    if (!clip) {
      this.toast.show('Nenhum corte em tela para dividir', 'error');
      return;
    }
    if (time <= clip.start + 0.1 || time >= clip.end - 0.1) {
      this.toast.show('Posicione o cursor dentro do corte', 'error');
      return;
    }
    this.state.snapshot();
    const index = this.state.clips.findIndex((c) => c.id === clip.id);
    const left = { ...clip, end: time, duration: time - clip.start, id: `${clip.id}-a` };
    const right = { ...clip, start: time, duration: clip.end - time, id: `${clip.id}-b` };
    this.state.clips.splice(index, 1, left, right);
    this.state.setActiveClip(left.id);
    this.toast.show('Corte dividido');
    this.refresh();
  }

  deleteActive() {
    const clip = this.state.getActiveClip();
    if (!clip) {
      this.toast.show('Nenhum corte em tela', 'error');
      return;
    }
    this.state.snapshot();
    this.state.removeClip(clip.id);
    this.toast.show('Corte apagado');
    this.refresh();
  }

  undo() {
    if (!this.state.undo()) {
      this.toast.show('Nada para desfazer');
      return;
    }
    this.refresh();
    this.toast.show('Desfeito');
  }

  redo() {
    if (!this.state.redo()) {
      this.toast.show('Nada para refazer');
      return;
    }
    this.refresh();
    this.toast.show('Refeito');
  }

  refresh() {
    window.dispatchEvent(new CustomEvent('clips:changed'));
    this.clips.updateActiveClipUI();
  }

  applyRatio() {
    const { frame, previewFormat } = this.els;
    const ratio = this.state.settings.ratio || '9:16';
    if (frame) {
      Object.values(RATIO_CLASS).forEach((cls) => frame.classList.remove(cls));
      frame.classList.add(RATIO_CLASS[ratio] || 'r916');
    }
    if (previewFormat) previewFormat.textContent = ratio;
    document.querySelectorAll('#ratioGrid [data-ratio]').forEach((btn) => {
      const active = btn.dataset.ratio === ratio;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  applyFocus() {
    const { frame, focusVal } = this.els;
    const focus = Number(this.state.settings.focus ?? 50);
    if (frame) frame.style.setProperty('--focus', `${focus}%`);
    if (focusVal) {
      focusVal.textContent = focus < 40 ? 'esquerda' : focus > 60 ? 'direita' : 'centro';
    }
  }
}
