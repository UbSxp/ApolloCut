/* ============================================================
   APOLLOCUT — Whisper Controller
   ============================================================ */

export class WhisperController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.whisperPipe = null;
    this.setupWhisper();
  }
  
  setupWhisper() {
    const { whisperBtn, whisperOverlay, whisperStart, whisperCancel, whisperClose, whisperLog } = this.els;
    
    if (whisperBtn) {
      whisperBtn.addEventListener('click', () => this.overlays.open(whisperOverlay));
    }
    
    if (whisperStart) {
      whisperStart.addEventListener('click', () => this.startWhisper());
    }
    
    if (whisperCancel) {
      whisperCancel.addEventListener('click', () => this.cancel());
    }
    
    if (whisperClose) {
      whisperClose.addEventListener('click', () => this.overlays.close(whisperOverlay));
    }
  }
  
  async startWhisper() {
    if (this.state.whisper.loading) return;
    if (!this.state.url) {
      this.toast.show('Carregue um vídeo primeiro', 'error');
      return;
    }
    
    this.state.whisper.loading = true;
    this.state.whisper.lastProgress = -1;
    
    const { whisperBar, whisperPct, whisperStage, whisperLog } = this.els;
    this.updateStage('Carregando modelo...', 0);
    this.log('Iniciando Whisper...');
    
    try {
      // Dynamic import to avoid blocking main thread
      const { pipeline } = await import('@huggingface/transformers');
      
      this.updateStage('Baixando modelo...', 10);
      this.log('Baixando modelo Whisper small...');
      
      this.whisperPipe = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-small_timestamped',
        { dtype: 'q8', device: 'webgpu' } // Use WebGPU if available
      );
      
      if (this.state.whisper.cancel) return;
      
      this.updateStage('Processando áudio...', 30);
      this.log('Extraindo áudio do vídeo...');
      
      // Extract audio blob
      const audioBlob = await this.extractAudioBlob();
      this.log('Áudio extraído, transcrevendo...');
      
      this.updateStage('Transcrevendo...', 50);
      
      // Run transcription with progress callback
      const result = await this.whisperPipe(audioBlob, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        language: this.state.settings.lang,
        callback: (progress) => this.onWhisperProgress(progress),
      });
      
      if (this.state.whisper.cancel) return;
      
      this.updateStage('Processando resultado...', 90);
      this.log('Transcrição concluída, processando...');
      
      // Process result into caption groups
      await this.processWhisperResult(result);
      
      this.updateStage('Concluído', 100);
      this.log('Whisper finalizado com sucesso!');
      this.toast.show('Transcrição concluída');
      
    } catch (error) {
      if (!this.state.whisper.cancel) {
        this.toast.show('Erro no Whisper', 'error');
        this.log(`Erro: ${error.message}`);
        console.error('Whisper error:', error);
      }
    } finally {
      this.state.whisper.loading = false;
      // Keep overlay open to show result
    }
  }
  
  async extractAudioBlob() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(this.state.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Convert to WAV blob
    const wavBlob = this.audioBufferToWav(audioBuffer);
    return wavBlob;
  }
  
  audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    this.writeString(view, 8, 'WAVE');
    
    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    
    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    
    // Write samples
    const offset = 44;
    const channels = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }
    
    let pos = offset;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(pos, sample * 0x7FFF, true);
        pos += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  
  onWhisperProgress(progress) {
    const pct = Math.round(progress * 100);
    if (pct !== this.state.whisper.lastProgress) {
      this.state.whisper.lastProgress = pct;
      this.updateProgress(50 + pct * 0.4); // 50-90%
      this.log(`Progresso: ${pct}%`);
    }
  }
  
  async processWhisperResult(result) {
    // Convert Whisper chunks to caption groups using existing caption engine
    const { groupsFromWhisperChunks } = await import('../captions/index.js');
    
    const chunks = result.chunks || [];
    const groups = groupsFromWhisperChunks(chunks, {
      timelineOffset: 0,
      clipLength: this.state.duration,
    });
    
    // Update cues in state
    this.state.cues = chunks.map(c => ({
      start: c.timestamp[0],
      end: c.timestamp[1],
      text: c.text,
    }));
    this.state.cueSource = 'whisper';
    
    // Update caption UI
    this.updateCaptionUI(groups);
  }
  
  updateCaptionUI(groups) {
    // This would integrate with CaptionController
    const event = new CustomEvent('whisper:result', { detail: { groups } });
    window.dispatchEvent(event);
  }
  
  updateStage(text, percent) {
    const { whisperStage, whisperPct, whisperBar } = this.els;
    if (whisperStage) whisperStage.textContent = text;
    if (whisperPct) whisperPct.textContent = `${percent}%`;
    if (whisperBar) whisperBar.style.width = `${percent}%`;
  }
  
  updateProgress(percent) {
    const { whisperPct, whisperBar } = this.els;
    if (whisperPct) whisperPct.textContent = `${Math.round(percent)}%`;
    if (whisperBar) whisperBar.style.width = `${percent}%`;
  }
  
  log(message) {
    const { whisperLog } = this.els;
    if (whisperLog) {
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      whisperLog.appendChild(line);
      whisperLog.scrollTop = whisperLog.scrollHeight;
    }
  }
  
  cancel() {
    this.state.whisper.cancel = true;
    if (this.whisperPipe) {
      // Transformers pipeline doesn't have a direct cancel, but we can ignore result
    }
    this.toast.show('Whisper cancelado');
  }
}