/* ============================================================
   APOLLOCUT — Captions Controller
   Importa SRT/VTT, mostra a legenda sincronizada no player,
   recebe o resultado do Whisper e exporta SRT/ASS.
   ============================================================ */

import { parseSubtitles } from '../captions/index.js';
import { drawCaption, carregarFontes, presetOf, aplicarTexto, linhasDe } from '../captions/render.js';
import { syncTabState } from './tabs.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

function downloadText(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export class CaptionController {
  constructor(state, els, toast) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.lastCue = null;
    this.setupCaptions();
  }

  setupCaptions() {
    const { importSrtBtn, styleGrid, srtInput, exportSrtBtn, exportAssBtn, previewVideo } = this.els;

    importSrtBtn?.addEventListener('click', () => srtInput?.click());

    srtInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const cues = parseSubtitles(text);
        if (!cues.length) throw new Error('Nenhuma legenda encontrada no arquivo.');
        this.state.cues = cues;
        this.state.cueFileName = file.name;
        this.state.cueSource = file.name.split('.').pop().toLowerCase();
        this.updateCaptionUI();
        this.toast.show(`${cues.length} blocos importados`);
      } catch (error) {
        console.error('SRT import:', error);
        this.toast.show(error.message || 'Falha ao importar legendas', 'error');
      } finally {
        event.target.value = '';
      }
    });

    this.setupCueEditor();

    exportSrtBtn?.addEventListener('click', () => this.exportSubtitles('srt'));
    exportAssBtn?.addEventListener('click', () => this.exportSubtitles('ass'));

    styleGrid?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-style]');
      if (!btn) return;
      this.state.updateSettings({ style: btn.dataset.style });
      this.updateStyleUI(btn.dataset.style);
      if (this.els.frame) this.els.frame.dataset.cap = btn.dataset.style;
      this.lastCue = null;
      this.renderAt(previewVideo?.currentTime || 0);
    });

    this.setupCaptionDrag();

    // O canvas acompanha o tamanho do quadro (janela, proporção, zoom).
    if (this.els.frame && typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.renderAt(previewVideo?.currentTime || 0));
      this.observer.observe(this.els.frame);
    }
    carregarFontes().then(() => {
      this.lastCue = null;
      this.renderAt(previewVideo?.currentTime || 0);
    }).catch(() => {});

    previewVideo?.addEventListener('timeupdate', () => this.renderAt(previewVideo.currentTime));
    previewVideo?.addEventListener('seeked', () => this.renderAt(previewVideo.currentTime));
    previewVideo?.addEventListener('emptied', () => this.clear());

    window.addEventListener('whisper:result', (e) => this.onWhisperResult(e.detail));
    window.addEventListener('clips:changed', () => this.renderAt(previewVideo?.currentTime || 0));

    if (this.els.frame) this.els.frame.dataset.cap = this.state.settings.style || 'ode';
    this.updateCaptionUI();
  }

  parseSRT(text) {
    return parseSubtitles(text);
  }

  setupCueEditor() {
    const { addCueBtn, cueList } = this.els;
    addCueBtn?.addEventListener('click', () => this.addCue());

    cueList?.addEventListener('input', (event) => {
      const row = event.target.closest('[data-cue]');
      if (!row) return;
      const cue = this.state.cues[Number(row.dataset.cue)];
      if (!cue) return;
      if (event.target.matches('textarea')) {
        cue.text = event.target.value;
        this.lastCue = null;
        this.renderAt(this.els.previewVideo?.currentTime || 0);
      } else if (event.target.dataset.cueTime) {
        const value = Math.max(0, Number(event.target.value) || 0);
        cue[event.target.dataset.cueTime] = value;
      }
    });

    cueList?.addEventListener('click', (event) => {
      const del = event.target.closest('.cue-del');
      if (!del) return;
      const row = del.closest('[data-cue]');
      this.state.cues.splice(Number(row.dataset.cue), 1);
      this.afterCuesChanged();
      this.toast.show('Bloco removido');
    });

    cueList?.addEventListener('change', (event) => {
      if (event.target.dataset.cueTime) this.afterCuesChanged();
    });
  }

  renderCueEditor() {
    const { cueList, cueEmpty } = this.els;
    if (!cueList) return;
    cueList.innerHTML = this.state.cues
      .map((cue, index) => `
        <div class="cue-row" data-cue="${index}">
          <input type="number" min="0" step="0.1" value="${Number(cue.start || 0).toFixed(1)}" data-cue-time="start" aria-label="In&iacute;cio do bloco ${index + 1}" />
          <input type="number" min="0" step="0.1" value="${Number(cue.end || 0).toFixed(1)}" data-cue-time="end" aria-label="Fim do bloco ${index + 1}" />
          <textarea rows="2" aria-label="Texto do bloco ${index + 1}">${escapeHtml(cue.text)}</textarea>
          <button class="cue-del" type="button" aria-label="Excluir bloco ${index + 1}">&times;</button>
        </div>`)
      .join('');
    if (cueEmpty) cueEmpty.hidden = this.state.cues.length > 0;
  }

  addCue() {
    const time = this.els.previewVideo?.currentTime || 0;
    const limit = this.state.duration || time + 2;
    const start = Math.min(time, Math.max(0, limit - 0.2));
    this.state.cues.push({
      start,
      end: Math.min(limit, start + 2),
      text: '',
    });
    this.state.cueSource = this.state.cueSource || 'manual';
    this.afterCuesChanged();
    const rows = this.els.cueList?.querySelectorAll('.cue-row');
    rows?.[rows.length - 1]?.querySelector('textarea')?.focus();
  }

  afterCuesChanged() {
    this.state.cues.sort((a, b) => a.start - b.start);
    this.lastCue = null;
    this.updateCaptionUI();
    this.renderAt(this.els.previewVideo?.currentTime || 0);
    window.dispatchEvent(new CustomEvent('cues:changed'));
  }

  /**
   * Configura arraste e alça de escala do bloco de legenda no canvas da prévia.
   * - Arrastar o bloco: move a legenda (salva captionPos {x, y})
   * - Alça no canto inferior-direito: escala a legenda (salva captionScale)
   * - Mostra área segura (safe-area) durante a interação
   */
  setupCaptionDrag() {
    const canvas = this.els.captionCanvas;
    const frame = this.els.frame;
    const safeArea = frame?.querySelector('.safe-area');
    if (!canvas || !frame || !safeArea) return;

    let dragging = false;
    let scaling = false;
    let dragStart = { x: 0, y: 0 };
    let startPos = { x: 0, y: 0 };
    let startScale = 1;
    let currentCue = null;
    let cueRect = { x: 0, y: 0, w: 0, h: 0 };
    const handleSize = 18; // px da alça de escala

    const showSafeArea = () => safeArea.style.opacity = '1';
    const hideSafeArea = () => safeArea.style.opacity = '';

    const getCueRect = (cue, ctx, width, height) => {
      if (!cue) return null;
      const preset = presetOf(this.state.settings.style);
      const scale = Number(this.state.settings.captionScale) || 1;
      const sizeBase = height * preset.size * scale;
      const maxWidth = width * (1 - 2 * preset.marginX);
      const texto = String(cue.text || '').replace(/\s+/g, ' ').trim();
      if (!texto) return null;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      aplicarTexto(ctx, preset, sizeBase, preset.color);
      const lines = linhasDe(cue, ctx, preset, maxWidth);
      ctx.restore();
      if (!lines.length) return null;

      const lineHeight = sizeBase * preset.lineHeight;
      const centroY = height * (this.state.settings.captionPos?.y ?? preset.y);
      const baseY = centroY - ((lines.length - 1) * lineHeight) / 2;
      const centroX = width * (this.state.settings.captionPos?.x ?? 0.5);
      const blockW = Math.max(...lines.map(l => ctx.measureText(l).width)) * scale;
      const blockH = lines.length * lineHeight * scale;
      return {
        x: centroX - blockW / 2,
        y: baseY,
        w: blockW,
        h: blockH,
        centroX,
        centroY,
        lineHeight: lineHeight * scale,
      };
    };

    const hitTest = (clientX, clientY, rect) => {
      const frameRect = frame.getBoundingClientRect();
      const x = clientX - frameRect.left;
      const y = clientY - frameRect.top;
      // Alça de escala (canto inferior-direito)
      if (x >= rect.x + rect.w - handleSize && x <= rect.x + rect.w + handleSize &&
          y >= rect.y + rect.h - handleSize && y <= rect.y + rect.h + handleSize) {
        return 'scale';
      }
      // Área do bloco para arraste
      if (x >= rect.x - 4 && x <= rect.x + rect.w + 4 &&
          y >= rect.y - 4 && y <= rect.y + rect.h + 4) {
        return 'drag';
      }
      return null;
    };

    const onPointerDown = (e) => {
      const cue = this.state.cues.find((c) => {
        const video = this.els.previewVideo;
        const t = video?.currentTime || 0;
        return t >= c.start && t <= c.end;
      });
      if (!cue) return;
      currentCue = cue;

      const ctx = canvas.getContext('2d');
      const frameRect = frame.getBoundingClientRect();
      cueRect = getCueRect(cue, ctx, frameRect.width, frameRect.height);
      if (!cueRect) return;

      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX === undefined) return;

      const action = hitTest(clientX, clientY, cueRect);
      if (!action) return;

      e.preventDefault();
      dragging = action === 'drag';
      scaling = action === 'scale';
      dragStart = { x: clientX, y: clientY };
      startPos = { x: this.state.settings.captionPos?.x ?? 0.5, y: this.state.settings.captionPos?.y ?? presetOf(this.state.settings.style).y };
      startScale = Number(this.state.settings.captionScale) || 1;
      showSafeArea();
      canvas.style.cursor = dragging ? 'grabbing' : 'se-resize';
      frame.style.userSelect = 'none';

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!dragging && !scaling) return;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX === undefined) return;

      const frameRect = frame.getBoundingClientRect();
      const width = frameRect.width;
      const height = frameRect.height;

      if (dragging) {
        const dx = (clientX - dragStart.x) / width;
        const dy = (clientY - dragStart.y) / height;
        const newX = Math.max(0.06, Math.min(0.94, startPos.x + dx));
        const newY = Math.max(0.07, Math.min(0.93, startPos.y + dy));
        this.state.updateSettings({ captionPos: { x: newX, y: newY } });
        this.lastCue = null;
        this.renderAt(this.els.previewVideo?.currentTime || 0);
      } else if (scaling) {
        const dy = (dragStart.y - clientY) / height; // subir = aumentar
        const newScale = Math.max(0.5, Math.min(2.5, startScale + dy * 3));
        this.state.updateSettings({ captionScale: newScale });
        this.lastCue = null;
        this.renderAt(this.els.previewVideo?.currentTime || 0);
      }
    };

    const onPointerUp = () => {
      dragging = false;
      scaling = false;
      hideSafeArea();
      canvas.style.cursor = '';
      frame.style.userSelect = '';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    const onPointerMoveHover = (e) => {
      if (dragging || scaling) return;
      const cue = this.state.cues.find((c) => {
        const video = this.els.previewVideo;
        const t = video?.currentTime || 0;
        return t >= c.start && t <= c.end;
      });
      if (!cue) { canvas.style.cursor = ''; return; }

      const ctx = canvas.getContext('2d');
      const frameRect = frame.getBoundingClientRect();
      const rect = getCueRect(cue, ctx, frameRect.width, frameRect.height);
      if (!rect) { canvas.style.cursor = ''; return; }

      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX === undefined) { canvas.style.cursor = ''; return; }

      const action = hitTest(clientX, clientY, rect);
      canvas.style.cursor = action === 'scale' ? 'se-resize' : action === 'drag' ? 'grab' : '';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMoveHover);
    canvas.addEventListener('pointerleave', () => { if (!dragging && !scaling) canvas.style.cursor = ''; });
  }

  onWhisperResult(detail) {
    // O WhisperController já gravou state.cues com tempos absolutos.
    if (detail?.cues?.length) this.state.cues = detail.cues;
    this.state.cueSource = 'whisper';
    this.updateCaptionUI();
    this.renderAt(this.els.previewVideo?.currentTime || 0);
    this.toast.show('Legendas do Whisper aplicadas');
  }

  clear() {
    const { captions } = this.els;
    if (captions) captions.innerHTML = '';
    this.lastCue = null;
    this.desenharQuadro(null, 0);
  }

  /**
   * Desenha o bloco no canvas do frame com o motor único (render.js).
   * A prévia e o vídeo exportado passam pela mesma função.
   */
  desenharQuadro(cue, time) {
    const canvas = this.els.captionCanvas;
    const frame = this.els.frame;
    if (!canvas || !frame) return;
    const rect = frame.getBoundingClientRect();
    const largura = Math.round(rect.width);
    const altura = Math.round(rect.height);
    if (!largura || !altura) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(largura * dpr) || canvas.height !== Math.round(altura * dpr)) {
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(altura * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, largura, altura);
    if (!cue) return;
    drawCaption(ctx, cue, {
      width: largura,
      height: altura,
      preset: this.state.settings.style,
      time,
      scale: Number(this.state.settings.captionScale) || 1,
      pos: this.state.settings.captionPos || null,
    });
  }

  renderAt(time) {
    const { captions, frameCaptionNote } = this.els;
    if (!captions) return;
    const cue = this.state.cues.find((c) => time >= c.start && time <= c.end) || null;
    this.desenharQuadro(cue, time);

    if (cue === this.lastCue) return;
    this.lastCue = cue;

    if (!cue) {
      captions.innerHTML = '';
      if (frameCaptionNote) frameCaptionNote.hidden = true;
      return;
    }

    // Texto acessível: o canvas não é lido por leitor de tela.
    const words = String(cue.text || '').split(/\s+/).filter(Boolean);
    captions.innerHTML = `<span class="cap-line">${words.map((word) => `<span class="cap-word">${word.replace(/[<>&]/g, '')}</span>`).join(' ')}</span>`;
    if (frameCaptionNote) frameCaptionNote.hidden = true;
  }

  updateCaptionUI() {
    const { captionStatus, captionStatusTitle, captionStatusText, styleGrid } = this.els;

    if (captionStatus) captionStatus.hidden = false;
    if (this.state.cues.length) {
      if (captionStatusTitle) captionStatusTitle.textContent = 'Legendas carregadas';
      if (captionStatusText) {
        captionStatusText.textContent = `${this.state.cues.length} blocos • Fonte: ${this.state.cueSource || 'manual'}`;
      }
    } else {
      if (captionStatusTitle) captionStatusTitle.textContent = 'Sem legendas';
      if (captionStatusText) captionStatusText.textContent = 'Importe um .srt/.vtt, transcreva o corte ou crie um bloco à mão.';
    }

    this.renderCueEditor();
    syncTabState(this.state);

    if (styleGrid) {
      styleGrid.querySelectorAll('[data-style]').forEach((btn) => {
        const active = btn.dataset.style === this.state.settings.style;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
  }

  updateStyleUI(style) {
    if (this.els.styleHint) this.els.styleHint.textContent = presetOf(style).label;
    if (!this.els.styleGrid) return;
    this.els.styleGrid.querySelectorAll('[data-style]').forEach((btn) => {
      const active = btn.dataset.style === style;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  getGroupsForClip(clip) {
    if (!this.state.cues.length) return [];
    return this.state.cues
      .filter((cue) => cue.end > clip.start && cue.start < clip.end)
      .map((cue) => ({
        start: Math.max(0, cue.start - clip.start),
        end: Math.min(clip.end - clip.start, cue.end - clip.start),
        words: String(cue.text || '').split(/\s+/).filter(Boolean).map((text) => ({ text })),
      }));
  }

  exportSubtitles(format) {
    const cues = [...this.state.cues].sort((a, b) => a.start - b.start);
    if (!cues.length) {
      this.toast.show('Nenhuma legenda para exportar', 'error');
      return;
    }

    if (format === 'srt') {
      const body = cues.map((cue, index) => {
        const text = String(cue.text || '').trim();
        return `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${text}\n`;
      }).join('\n');
      downloadText('apollocut-legendas.srt', body, 'application/x-subrip;charset=utf-8');
    } else {
      const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Apollo,Cormorant Garamond,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
      const body = cues.map((cue) => {
        const text = String(cue.text || '').replace(/\r?\n/g, '\\N').trim();
        return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Apollo,,0,0,0,,${text}`;
      }).join('\n');
      downloadText('apollocut-legendas.ass', `${header}${body}\n`, 'text/plain;charset=utf-8');
    }

    this.toast.show(`Legendas .${format} exportadas`);
  }
}
