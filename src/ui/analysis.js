/* ============================================================
   APOLLOCUT — Analysis Controller
   ============================================================ */

import { fmtTime } from '../utils/helpers.js';

export class AnalysisController {
  constructor(state, els, toast, overlays) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.overlays = overlays;
    this.setupAnalysis();
  }
  
  setupAnalysis() {
    const { analyzeBtn, analysisOverlay, analysisCancelBtn, analysisBar, analysisPct, analysisStage, analysisSheet, analysisCounter } = this.els;
    
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.startAnalysis());
    }
    
    if (analysisCancelBtn) {
      analysisCancelBtn.addEventListener('click', () => this.cancel());
    }
  }
  
  async startAnalysis() {
    if (this.state.analysis.running) return;
    if (!this.state.url) {
      this.toast.show('Carregue um vídeo primeiro', 'error');
      return;
    }
    
    this.state.analysis.running = true;
    this.state.analysis.cancel = false;
    this.state.analysis.samples = [];
    this.state.analysis.total = 0;
    this.state.analysis.done = 0;
    
    this.overlays.open(this.els.analysisOverlay);
    this.toast.show('Análise iniciada');
    
    try {
      await this.runAnalysis();
      if (!this.state.analysis.cancel) {
        this.generateClipsFromAnalysis();
        this.toast.show('Análise concluída');
      }
    } catch (error) {
      if (!this.state.analysis.cancel) {
        this.toast.show('Erro na análise', 'error');
        console.error('Analysis error:', error);
      }
    } finally {
      this.state.analysis.running = false;
      this.overlays.close(this.els.analysisOverlay);
      this.updateAnalysisUI();
    }
  }
  
  async runAnalysis() {
    const { analysisBar, analysisPct, analysisStage, analysisSheet, analysisCounter } = this.els;
    
    // Stage 1: Extract audio
    this.updateStage('Extraindo áudio...', 10);
    
    const audioData = await this.extractAudio();
    if (this.state.analysis.cancel) return;
    
    // Stage 2: Analyze audio energy
    this.updateStage('Analisando energia...', 30);
    
    const energyData = await this.analyzeEnergy(audioData);
    if (this.state.analysis.cancel) return;
    
    // Stage 3: Detect speech segments
    this.updateStage('Detectando fala...', 60);
    
    const speechSegments = await this.detectSpeech(energyData);
    if (this.state.analysis.cancel) return;
    
    // Stage 4: Score and rank segments
    this.updateStage('Pontuando segmentos...', 80);
    
    const scoredSegments = this.scoreSegments(speechSegments);
    if (this.state.analysis.cancel) return;
    
    // Stage 5: Select best clips
    this.updateStage('Selecionando melhores cortes', 90);
    
    this.state.analysis.samples = scoredSegments;
    this.state.analysis.total = scoredSegments.length;
    this.state.analysis.done = scoredSegments.length;
    
    this.updateStage('Concluído', 100);
  }
  
  async extractAudio() {
    // Create audio context and decode audio
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(this.state.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Downmix to mono
    const channelCount = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoData = new Float32Array(length);
    
    for (let c = 0; c < channelCount; c++) {
      const channelData = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        monoData[i] += channelData[i] / channelCount;
      }
    }
    
    this.state.audio.ctx = audioCtx;
    return { data: monoData, sampleRate: audioBuffer.sampleRate, duration: audioBuffer.duration };
  }
  
  async analyzeEnergy(audioData) {
    const { data, sampleRate } = audioData;
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
    const hopSize = Math.floor(sampleRate * 0.025); // 25ms hop
    const numWindows = Math.floor((data.length - windowSize) / hopSize) + 1;
    
    const energy = new Float32Array(numWindows);
    
    for (let i = 0; i < numWindows; i++) {
      if (this.state.analysis.cancel) break;
      
      const start = i * hopSize;
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        const val = data[start + j];
        sum += val * val;
      }
      energy[i] = Math.sqrt(sum / windowSize); // RMS
      
      // Update progress
      if (i % 100 === 0) {
        this.updateProgress(30 + (i / numWindows) * 30);
      }
    }
    
    return { energy, sampleRate, hopSize, windowSize };
  }
  
  async detectSpeech(energyData) {
    const { energy, sampleRate, hopSize, windowSize } = energyData;
    const threshold = this.calculateThreshold(energy);
    const minSpeechDuration = sampleRate * 0.3 / hopSize; // 300ms
    const minSilenceDuration = sampleRate * 0.15 / hopSize; // 150ms
    
    const segments = [];
    let inSpeech = false;
    let speechStart = 0;
    let silenceCount = 0;
    
    for (let i = 0; i < energy.length; i++) {
      if (this.state.analysis.cancel) break;
      
      const isSpeech = energy[i] > threshold;
      
      if (isSpeech && !inSpeech) {
        inSpeech = true;
        speechStart = i;
        silenceCount = 0;
      } else if (!isSpeech && inSpeech) {
        silenceCount++;
        if (silenceCount >= minSilenceDuration) {
          const speechEnd = i - silenceCount;
          if (speechEnd - speechStart >= minSpeechDuration) {
            segments.push({
              start: (speechStart * hopSize) / sampleRate,
              end: (speechEnd * hopSize) / sampleRate,
              energy: energy.slice(speechStart, speechEnd),
            });
          }
          inSpeech = false;
        }
      } else if (isSpeech && inSpeech) {
        silenceCount = 0;
      }
      
      // Update progress
      if (i % 100 === 0) {
        this.updateProgress(60 + (i / energy.length) * 20);
      }
    }
    
    // Handle case where speech continues to end
    if (inSpeech) {
      const speechEnd = energy.length;
      if (speechEnd - speechStart >= minSpeechDuration) {
        segments.push({
          start: (speechStart * hopSize) / sampleRate,
          end: (speechEnd * hopSize) / sampleRate,
          energy: energy.slice(speechStart, speechEnd),
        });
      }
    }
    
    return segments;
  }
  
  calculateThreshold(energy) {
    // Use percentile-based threshold
    const sorted = [...energy].sort((a, b) => a - b);
    const percentile90 = sorted[Math.floor(sorted.length * 0.9)];
    const percentile10 = sorted[Math.floor(sorted.length * 0.1)];
    return percentile10 + (percentile90 - percentile10) * 0.3;
  }
  
  scoreSegments(segments) {
    const targetLength = this.state.settings.length;
    const targetCount = this.state.settings.count;
    
    return segments
      .map(seg => {
        const duration = seg.end - seg.start;
        const avgEnergy = seg.energy.reduce((a, b) => a + b, 0) / seg.energy.length;
        
        // Score based on duration closeness to target and energy
        const durationScore = 1 - Math.min(1, Math.abs(duration - targetLength) / targetLength);
        const energyScore = Math.min(1, avgEnergy * 10); // Normalize
        
        return {
          ...seg,
          duration,
          avgEnergy,
          score: durationScore * 0.6 + energyScore * 0.4,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, targetCount * 3); // Keep top 3x for selection
  }
  
  generateClipsFromAnalysis() {
    const samples = this.state.analysis.samples;
    const count = Math.max(1, Number(this.state.settings.count) || 4);
    const targetLength = Math.max(2, Number(this.state.settings.length) || 60);
    const duration = this.state.duration || 0;

    this.state.clearClips();
    if (!duration) return;

    const clips = [];
    const used = [];

    const overlaps = (a, b) => a.start < b.end - 0.05 && b.start < a.end - 0.05;

    // Filme mais curto que o corte pedido: divide em fatias iguais,
    // senão o "corte" seria o filme inteiro repetido N vezes.
    if (duration <= targetLength) {
      const parts = Math.max(1, Math.min(count, Math.floor(duration / 2) || 1));
      const size = duration / parts;
      for (let i = 0; i < parts; i++) {
        clips.push({ start: i * size, end: (i + 1) * size, duration: size, score: 1 });
      }
    } else {
      // Ordena por energia e abre uma janela do tamanho pedido em volta
      // de cada pico de fala, sem sobrepor.
      const ranked = [...samples].sort((a, b) => (b.avgEnergy || 0) - (a.avgEnergy || 0));
      for (const seg of ranked) {
        if (clips.length >= count) break;
        const middle = (seg.start + seg.end) / 2;
        let start = Math.max(0, middle - targetLength / 2);
        let end = Math.min(duration, start + targetLength);
        start = Math.max(0, end - targetLength);
        const candidate = { start, end, duration: end - start, score: seg.score || 1 };
        if (used.some((u) => overlaps(candidate, u))) continue;
        used.push(candidate);
        clips.push(candidate);
      }
      // Sem fala detectada (vídeo mudo): fatias iguais.
      if (!clips.length) {
        const parts = Math.max(1, Math.min(count, Math.floor(duration / 2) || 1));
        const size = duration / parts;
        for (let i = 0; i < parts; i++) {
          clips.push({ start: i * size, end: (i + 1) * size, duration: size, score: 1 });
        }
      }
    }

    clips
      .sort((a, b) => a.start - b.start)
      .forEach((clip, index) => {
        this.state.addClip({
          id: `clip-${Date.now()}-${index}`,
          start: clip.start,
          end: clip.end,
          duration: clip.duration,
          score: clip.score,
          words: [],
        });
      });

    if (this.state.clips.length) {
      this.state.setActiveClip(this.state.clips[0].id);
    }

    this.updateAnalysisUI();
    // A grade de cortes só existia no estado: nenhum controller a desenhava.
    window.dispatchEvent(new CustomEvent('clips:changed'));
  }
  
  updateStage(text, percent) {
    const { analysisStage, analysisPct, analysisBar } = this.els;
    if (analysisStage) analysisStage.textContent = text;
    if (analysisPct) analysisPct.textContent = `${Math.round(percent)}%`;
    if (analysisBar) analysisBar.style.width = `${percent}%`;
  }
  
  updateProgress(percent) {
    const { analysisPct, analysisBar } = this.els;
    if (analysisPct) analysisPct.textContent = `${Math.round(percent)}%`;
    if (analysisBar) analysisBar.style.width = `${percent}%`;
  }
  
  updateAnalysisUI() {
    const { analysisSummary, sumSamples, sumSelected, sumScore, sumNote, activeClipInfo, activeClipTitle, activeClipMeta } = this.els;
    
    if (analysisSummary) {
      analysisSummary.hidden = this.state.analysis.samples.length === 0;
    }
    
    if (sumSamples) sumSamples.textContent = this.state.analysis.total;
    if (sumSelected) sumSelected.textContent = this.state.clips.length;
    if (sumScore) sumScore.textContent = this.state.clips.length 
      ? (this.state.clips.reduce((a, c) => a + c.score, 0) / this.state.clips.length).toFixed(2)
      : '—';
    
    const activeClip = this.state.getActiveClip();
    if (activeClipInfo) activeClipInfo.hidden = !activeClip;
    if (activeClipTitle) activeClipTitle.textContent = activeClip ? `Corte ${this.state.clips.findIndex(c => c.id === activeClip.id) + 1}` : '—';
    if (activeClipMeta) activeClipMeta.textContent = activeClip 
      ? `${fmtTime(activeClip.start)}–${fmtTime(activeClip.end)} (${activeClip.duration.toFixed(1)}s)` 
      : '—';
  }
  
  cancel() {
    this.state.analysis.cancel = true;
    this.toast.show('Análise cancelada');
  }
}