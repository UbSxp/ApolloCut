/* ============================================================
   APOLLOCUT — Captions Controller
   Importa SRT/VTT, mostra a legenda sincronizada no player,
   recebe o resultado do Whisper e exporta SRT/ASS.
   ============================================================ */

import { parseSubtitles } from '../captions/index.js';

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

    exportSrtBtn?.addEventListener('click', () => this.exportSubtitles('srt'));
    exportAssBtn?.addEventListener('click', () => this.exportSubtitles('ass'));

    styleGrid?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-style]');
      if (!btn) return;
      this.state.updateSettings({ style: btn.dataset.style });
      this.updateStyleUI(btn.dataset.style);
      if (this.els.frame) this.els.frame.dataset.cap = btn.dataset.style;
    });

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
  }

  renderAt(time) {
    const { captions, frameCaptionNote } = this.els;
    if (!captions) return;
    const cue = this.state.cues.find((c) => time >= c.start && time <= c.end) || null;

    if (cue === this.lastCue) return;
    this.lastCue = cue;

    if (!cue) {
      captions.innerHTML = '';
      if (frameCaptionNote) frameCaptionNote.hidden = true;
      return;
    }

    const words = String(cue.text || '').split(/\s+/).filter(Boolean);
    captions.innerHTML = `<span class="cap-line">${words.map((word) => `<span class="cap-word">${word.replace(/[<>&]/g, '')}</span>`).join(' ')}</span>`;
    if (frameCaptionNote) frameCaptionNote.hidden = true;
  }

  updateCaptionUI() {
    const { captionStatus, captionStatusTitle, captionStatusText, styleGrid } = this.els;

    if (this.state.cues.length) {
      if (captionStatus) captionStatus.hidden = false;
      if (captionStatusTitle) captionStatusTitle.textContent = 'Legendas carregadas';
      if (captionStatusText) {
        captionStatusText.textContent = `${this.state.cues.length} blocos • Fonte: ${this.state.cueSource || 'manual'}`;
      }
    } else if (captionStatus) {
      captionStatus.hidden = true;
    }

    if (styleGrid) {
      styleGrid.querySelectorAll('[data-style]').forEach((btn) => {
        const active = btn.dataset.style === this.state.settings.style;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
  }

  updateStyleUI(style) {
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
