/* ============================================================
   APOLLOCUT — Whisper Controller
   Extrai o áudio do corte (mono 16 kHz), roda o modelo local em
   Web Worker e entrega blocos com tempos para as legendas.
   ============================================================ */

import { sanitizeTranscript, distributeWords, groupWords } from '../captions/index.js';

const MODEL = 'onnx-community/whisper-base';
const FALLBACK_MODEL = 'onnx-community/whisper-tiny';
const RATE = 16000;

function rms(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, data.length));
}

export class WhisperController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.worker = null;
    this.timer = 0;
    this.setupWhisper();
  }

  setupWhisper() {
    const { whisperBtn, whisperOverlay, whisperStart, whisperCancel, whisperClose } = this.els;

    whisperBtn?.addEventListener('click', () => {
      this.updateClipLabel();
      this.overlays.open(whisperOverlay);
    });

    whisperStart?.addEventListener('click', () => this.startWhisper());
    whisperCancel?.addEventListener('click', () => this.cancel());
    whisperClose?.addEventListener('click', () => this.overlays.close(whisperOverlay));
  }

  getTargetClip() {
    const clip = this.state.getActiveClip() || this.state.clips[0] || null;
    if (clip) return clip;
    if (!this.state.duration) return null;
    return { id: 'full', start: 0, end: this.state.duration, duration: this.state.duration };
  }

  updateClipLabel() {
    const { whisperClip } = this.els;
    const clip = this.getTargetClip();
    if (whisperClip) {
      whisperClip.textContent = clip
        ? `${clip.start.toFixed(1)}s → ${clip.end.toFixed(1)}s (${(clip.end - clip.start).toFixed(1)}s)`
        : 'Carregue um vídeo primeiro.';
    }
  }

  log(message) {
    const { whisperLog } = this.els;
    if (!whisperLog) return;
    const stamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    const line = `[${stamp}] ${message}`;
    whisperLog.textContent = `${whisperLog.textContent ? whisperLog.textContent + '\n' : ''}${line}`.slice(-4000);
    whisperLog.scrollTop = whisperLog.scrollHeight;
  }

  setProgress(pct, note) {
    const { whisperBar, whisperPct, whisperStage } = this.els;
    const value = Math.round(Math.max(0, Math.min(100, pct)));
    if (whisperBar) {
      whisperBar.style.width = `${value}%`;
      whisperBar.setAttribute('aria-valuenow', String(value));
    }
    if (whisperPct) whisperPct.textContent = `${value}%`;
    if (whisperStage && note) whisperStage.textContent = note;
  }

  setStage(stage) {
    document.querySelectorAll('[data-wstage]').forEach((li) => {
      li.classList.toggle('active', li.dataset.wstage === stage);
      if (li.dataset.wstage === stage) li.classList.add('done');
    });
  }

  drawWave(audio) {
    const { whisperWave } = this.els;
    if (!whisperWave) return;
    const ctx = whisperWave.getContext('2d');
    const w = whisperWave.width;
    const h = whisperWave.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--gold') || '#c9a227';
    const bars = 180;
    const step = Math.floor(audio.length / bars) || 1;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      for (let j = 0; j < step; j += 8) {
        const v = Math.abs(audio[i * step + j] || 0);
        if (v > peak) peak = v;
      }
      const bh = Math.max(2, Math.min(h - 4, peak * h * 3));
      const x = (i / bars) * w;
      ctx.fillRect(x, (h - bh) / 2, Math.max(2, w / bars - 2), bh);
    }
  }

  async extractAudio(clip) {
    const res = await fetch(this.state.url);
    if (!res.ok) throw new Error('Não foi possível ler o arquivo de vídeo.');
    const buffer = await res.arrayBuffer();

    const start = Math.max(0, clip.start);
    const end = Math.min(this.state.duration || clip.end, clip.end);
    const seconds = Math.max(0.2, end - start);
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error('Este navegador não decodifica áudio (OfflineAudioContext ausente).');

    const offline = new Offline(1, Math.ceil(seconds * RATE), RATE);
    let decoded;
    try {
      decoded = await offline.decodeAudioData(buffer);
    } catch (_) {
      // Acontece com vídeo sem faixa de áudio ou arquivo corrompido.
      throw new Error('Este vídeo não tem áudio decodificável (sem faixa de áudio ou arquivo danificado). Nada para transcrever.');
    }
    const source = decoded.getChannelData(0);
    const from = Math.floor(start * RATE);
    const to = Math.min(source.length, Math.ceil(end * RATE));
    const audio = source.slice(from, to);
    if (!audio.length) throw new Error('O trecho selecionado não tem áudio.');
    return audio;
  }

  async startWhisper() {
    if (this.state.capture.running) return;
    const clip = this.getTargetClip();
    if (!clip || !this.state.url) {
      this.toast.show('Carregue um vídeo primeiro', 'error');
      return;
    }

    this.state.capture.running = true;
    const { whisperStart } = this.els;
    if (whisperStart) whisperStart.disabled = true;
    this.log('Iniciando transcrição…');
    this.setStage('capture');
    this.setProgress(3, 'Extraindo áudio do corte…');

    try {
      const audio = await this.extractAudio(clip);
      const level = rms(audio);
      this.drawWave(audio);
      if (level < 0.0015) {
        throw new Error('O áudio do corte está mudo ou quase inaudível. Nada para transcrever.');
      }
      this.log(`Áudio pronto: ${(audio.length / RATE).toFixed(1)}s, nível ${level.toFixed(3)}.`);
      this.setStage('prepare');
      this.setProgress(12, 'Preparando o modelo…');

      const groups = await this.runWorker(audio, clip);
      this.finish(groups, clip);
    } catch (error) {
      console.error('Whisper error:', error);
      this.log(`Erro: ${error.message}`);
      this.setProgress(0, 'Falhou.');
      this.toast.show(error.message || 'Falha na transcrição', 'error');
    } finally {
      this.state.capture.running = false;
      if (whisperStart) whisperStart.disabled = false;
      clearInterval(this.timer);
      this.worker?.terminate();
      this.worker = null;
    }
  }

  runWorker(audio, clip) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
      this.worker = worker;

      let modelPct = 0;
      this.timer = setInterval(() => {
        // Inferência não reporta progresso fino: avança devagar até 95%.
        const bar = this.els.whisperBar;
        const current = Number((bar?.style.width || '0').replace('%', '')) || 0;
        if (current < 95) this.setProgress(current + 0.6);
      }, 700);

      worker.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'stage') {
          this.setStage(msg.stage);
          this.setProgress(msg.pct || 20, msg.note || '');
          return;
        }
        if (msg.type === 'progress') {
          modelPct = msg.pct || modelPct;
          this.setProgress(20 + modelPct * 0.35, `Baixando modelo: ${msg.file || ''} ${Math.round(modelPct)}%`);
          return;
        }
        if (msg.type === 'result') {
          clearInterval(this.timer);
          this.setProgress(100, 'Concluído.');
          this.state.whisper.model = msg.model;
          this.state.whisper.lastMs = msg.ms;
          this.log(`Modelo ${msg.model} (${msg.device}) em ${(msg.ms / 1000).toFixed(1)}s.`);
          resolve(this.toGroups(msg.chunks, clip));
          return;
        }
        if (msg.type === 'error') {
          clearInterval(this.timer);
          reject(new Error(msg.message || 'O worker de transcrição falhou.'));
        }
      });

      worker.addEventListener('error', (event) => {
        clearInterval(this.timer);
        reject(new Error(`Worker falhou: ${event.message || 'erro desconhecido'}`));
      });

      const language = this.els.langSelect?.value || 'pt';
      const model = this.state.whisper?.requestedModel || MODEL;
      worker.postMessage({
        type: 'start',
        audio,
        language,
        model,
        preferWebgpu: false,
      }, [audio.buffer]);
    });
  }

  toGroups(chunks, clip) {
    const words = [];
    for (const chunk of chunks || []) {
      const text = sanitizeTranscript(chunk?.text);
      if (!text) continue;
      const ts = Array.isArray(chunk.timestamp) ? chunk.timestamp : null;
      let start = ts && Number.isFinite(Number(ts[0])) ? Math.max(0, Number(ts[0])) : 0;
      let end = ts && Number.isFinite(Number(ts[1])) ? Number(ts[1]) : start + Math.max(0.5, text.length * 0.06);
      if (!(end > start)) end = start + Math.max(0.5, text.length * 0.06);
      words.push(...distributeWords(text, start, end));
    }

    // Ordena e remove sobreposições (o modelo pode repetir bordas de bloco).
    words.sort((a, b) => a.start - b.start || a.end - b.end);
    let lastEnd = 0;
    for (const word of words) {
      if (word.start < lastEnd) word.start = lastEnd;
      if (word.end <= word.start) word.end = word.start + 0.12;
      lastEnd = word.end;
    }

    const length = Math.max(0.2, clip.end - clip.start);
    const clipped = words
      .filter((word) => word.start < length)
      .map((word) => ({ ...word, start: Math.min(word.start, length), end: Math.min(word.end, length) }))
      .filter((word) => word.end > word.start);

    return groupWords(clipped, { maxWords: 4, maxChars: 28, maxGap: 0.9 });
  }

  finish(groups, clip) {
    if (!groups.length) {
      this.log('Nenhuma fala reconhecida no corte.');
      this.toast.show('Nenhuma fala reconhecida', 'error');
      return;
    }

    const text = groups.map((g) => g.words.map((w) => w.text).join(' ')).join(' ');
    this.state.cues = groups.map((group) => ({
      start: clip.start + group.start,
      end: clip.start + group.end,
      text: group.words.map((word) => word.text).join(' '),
    }));
    this.state.cueSource = 'whisper';

    window.dispatchEvent(new CustomEvent('whisper:result', {
      detail: { groups, clip, text, cues: this.state.cues },
    }));

    this.log(`Pronto: ${groups.length} blocos.`);
    this.toast.show('Transcrição concluída');
    setTimeout(() => this.overlays.close(this.els.whisperOverlay), 700);
  }

  cancel() {
    this.state.capture.cancel = true;
    this.worker?.terminate();
    this.worker = null;
    clearInterval(this.timer);
    this.state.capture.running = false;
    if (this.els.whisperStart) this.els.whisperStart.disabled = false;
    this.setProgress(0, 'Cancelado.');
    this.log('Cancelado pelo usuário.');
  }
}
