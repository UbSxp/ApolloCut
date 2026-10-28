/* ============================================================
   APOLLOCUT — Player Controller
   ============================================================ */

import { fmtTime } from '../utils/helpers.js';

export class PlayerController {
  constructor(state, els, toast) {
    this.state = state;
    this.els = els;
    this.toast = toast;
    this.rafId = 0;
    this.setupPlayer();
  }
  
  setupPlayer() {
    const { previewVideo, playBtn, seekRange, timeLabel, seekMarks } = this.els;
    
    if (previewVideo) {
      previewVideo.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
      previewVideo.addEventListener('timeupdate', () => this.onTimeUpdate());
      previewVideo.addEventListener('ended', () => this.onEnded());
      previewVideo.addEventListener('error', (e) => this.onError(e));
    }
    
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlay());
    }
    
    if (seekRange) {
      seekRange.addEventListener('input', (e) => this.onSeekInput(e));
      seekRange.addEventListener('change', (e) => this.onSeekChange(e));
    }

    // Marcadores dos cortes na timeline nascem dos eventos de edição.
    window.addEventListener('clips:changed', () => this.createSeekMarks());
  }
  
  async loadVideo(url) {
    const { previewVideo } = this.els;
    if (!previewVideo) return;

    previewVideo.pause();
    previewVideo.src = url;
    previewVideo.load();

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        previewVideo.removeEventListener('loadedmetadata', onLoaded);
        previewVideo.removeEventListener('error', onError);
      };
      const onLoaded = () => { cleanup(); resolve(); };
      const onError = (e) => { cleanup(); reject(e); };
      // Guard: a corrupt or unsupported file must not hang the UI forever.
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timeout'));
      }, 15000);
      previewVideo.addEventListener('loadedmetadata', onLoaded);
      previewVideo.addEventListener('error', onError);
    });
  }
  
  onLoadedMetadata() {
    const { previewVideo, seekRange, timeLabel } = this.els;
    this.state.duration = previewVideo.duration;
    this.state.width = previewVideo.videoWidth;
    this.state.height = previewVideo.videoHeight;
    this.state.ready = true;
    
    if (seekRange) {
      seekRange.max = previewVideo.duration;
      seekRange.value = 0;
    }
    this.updateTimeLabel(0, previewVideo.duration);
  }
  
  onTimeUpdate() {
    const { previewVideo, seekRange, timeLabel, seekMarks } = this.els;
    if (!previewVideo) return;

    // Pré-visualização de um corte: para no fim do trecho.
    const range = this.state.playRange;
    if (range && previewVideo.currentTime >= range.end) {
      previewVideo.pause();
      previewVideo.currentTime = range.end;
      this.setPlayButton(false);
    }

    if (previewVideo.paused) return;
    
    if (seekRange) {
      seekRange.value = previewVideo.currentTime;
      this.updateSeekFill(seekRange);
    }
    this.updateTimeLabel(previewVideo.currentTime, previewVideo.duration);
    this.updateSeekMarks(previewVideo.currentTime);
  }

  setPlayButton(playing) {
    const { playBtn } = this.els;
    if (!playBtn) return;
    playBtn.classList.toggle('playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
  }

  /** Reproduz apenas um trecho (pré-visualização do corte). */
  playRange(start, end) {
    const { previewVideo } = this.els;
    if (!previewVideo) return;
    this.state.playRange = { start, end };
    previewVideo.currentTime = start;
    previewVideo.play().catch(() => {});
    this.setPlayButton(true);
  }
  
  onEnded() {
    this.state.playRange = null;
    this.setPlayButton(false);
  }
  
  onError(event) {
    this.toast.show('Erro ao carregar vídeo', 'error');
    console.error('Video error:', event);
  }
  
  onSeekInput(event) {
    const { previewVideo, seekRange } = this.els;
    // Arrastar a timeline sai do modo "pré-visualizar corte".
    this.state.playRange = null;
    if (previewVideo && seekRange) {
      previewVideo.currentTime = Number(seekRange.value);
      this.updateTimeLabel(previewVideo.currentTime, previewVideo.duration);
      this.updateSeekFill(seekRange);
    }
  }
  
  onSeekChange(event) {
    const { previewVideo } = this.els;
    if (previewVideo && !previewVideo.paused) {
      // Resume playback after seek
      previewVideo.play().catch(() => {});
    }
  }
  
  togglePlay() {
    const { previewVideo } = this.els;
    if (!previewVideo) return;

    if (previewVideo.paused) {
      const range = this.state.playRange;
      if (range && previewVideo.currentTime >= range.end - 0.05) {
        previewVideo.currentTime = range.start;
      }
      previewVideo.play().catch(() => {});
      this.setPlayButton(true);
    } else {
      previewVideo.pause();
      this.setPlayButton(false);
    }
  }
  
  seekTo(time) {
    const { previewVideo, seekRange } = this.els;
    if (previewVideo) {
      previewVideo.currentTime = Math.max(0, Math.min(time, this.state.duration));
      if (seekRange) {
        seekRange.value = previewVideo.currentTime;
        this.updateSeekFill(seekRange);
      }
      this.updateTimeLabel(previewVideo.currentTime, previewVideo.duration);
    }
  }
  
  updateTimeLabel(current, total) {
    const { timeLabel } = this.els;
    if (timeLabel) {
      timeLabel.textContent = `${fmtTime(current)} / ${fmtTime(total)}`;
    }
  }
  
  updateSeekFill(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--p', `${Math.min(100, Math.max(0, pct))}%`);
  }
  
  updateSeekMarks(currentTime) {
    const { seekMarks } = this.els;
    if (!seekMarks || !this.state.clips.length) return;
    
    // Update clip markers on seek bar
    const marks = seekMarks.querySelectorAll('.seek-mark');
    marks.forEach((mark, index) => {
      const clip = this.state.clips[index];
      if (clip) {
        const pct = (clip.start / this.state.duration) * 100;
        mark.style.left = `${pct}%`;
      }
    });
  }
  
  /**
   * Create clip markers on seek bar
   */
  createSeekMarks() {
    const { seekMarks } = this.els;
    if (!seekMarks) return;
    
    seekMarks.innerHTML = '';
    this.state.clips.forEach((clip, index) => {
      const mark = document.createElement('div');
      mark.className = 'seek-mark';
      mark.dataset.clipId = clip.id;
      const pct = (clip.start / this.state.duration) * 100;
      mark.style.left = `${pct}%`;
      mark.setAttribute('role', 'button');
      mark.setAttribute('tabindex', '0');
      mark.setAttribute('aria-label', `Corte ${index + 1}: ${fmtTime(clip.start)}–${fmtTime(clip.end)}`);
      mark.addEventListener('click', () => this.state.setActiveClip(clip.id));
      mark.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.state.setActiveClip(clip.id);
        }
      });
      seekMarks.appendChild(mark);
    });
  }
  
  /**
   * Get current playback time
   */
  getCurrentTime() {
    const { previewVideo } = this.els;
    return previewVideo ? previewVideo.currentTime : 0;
  }
  
  /**
   * Set playback rate
   */
  setPlaybackRate(rate) {
    const { previewVideo } = this.els;
    if (previewVideo) {
      previewVideo.playbackRate = rate;
    }
  }
  
  /**
   * Cleanup
   */
  destroy() {
    const { previewVideo } = this.els;
    if (previewVideo) {
      previewVideo.pause();
      previewVideo.src = '';
      previewVideo.load();
    }
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}