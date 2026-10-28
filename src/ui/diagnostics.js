/* ============================================================
   APOLLOCUT — Diagnóstico
   Painel discreto com o estado real do ambiente + últimos erros.
   Atalho: Ctrl+Shift+D
   ============================================================ */

export class DiagnosticsController {
  constructor(state, els, overlays, toast) {
    this.state = state;
    this.els = els;
    this.overlays = overlays;
    this.toast = toast;
    this.setup();
  }

  setup() {
    const btn = document.getElementById('diagnosticsBtn');
    const close = document.getElementById('diagnosticsClose');
    const copy = document.getElementById('diagnosticsCopy');

    btn?.addEventListener('click', () => this.open());
    close?.addEventListener('click', () => this.overlays.close(this.els.diagnosticsOverlay));
    copy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.report());
        this.toast.show('Relatório copiado');
      } catch (_) {
        this.toast.show('Não foi possível copiar; selecione o texto', 'error');
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.open();
      }
    });
  }

  open() {
    const out = this.els.diagnosticsOut;
    if (out) out.textContent = this.report();
    this.overlays.open(this.els.diagnosticsOverlay);
  }

  report() {
    const health = window.__APOLLO_HEALTH__?.() || { mode: location.protocol };
    const state = this.state;
    return JSON.stringify({
      geradoEm: new Date().toISOString(),
      ...health,
      whisperModel: state.whisper?.model || 'nenhum (transcreva para carregar)',
      whisperLastMs: state.whisper?.lastMs || null,
      video: state.url ? {
        duracao: state.duration,
        largura: state.width,
        altura: state.height,
        tamanhoMB: +(state.size / 1024 / 1024).toFixed(2),
      } : null,
      cortes: state.clips.length,
      legendas: state.cues.length,
      tema: document.documentElement.dataset.theme,
      errosRecentes: window.__APOLLO_ERRORS__?.slice(-10) || [],
    }, null, 2);
  }
}
