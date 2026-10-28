/* ============================================================
   APOLLOCUT — boot clássico (roda até em file://)
   Avisa quando o app foi aberto como arquivo e guarda erros
   para o painel de diagnóstico.
   ============================================================ */
(function () {
  'use strict';

  var errors = [];
  window.__APOLLO_ERRORS__ = errors;

  function record(kind, message) {
    errors.push({ at: new Date().toISOString(), kind: kind, message: String(message || '') });
    if (errors.length > 40) errors.shift();
  }

  window.addEventListener('error', function (event) {
    record('error', event.message || (event.target && event.target.src) || 'erro');
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    record('promise', event.reason && (event.reason.stack || event.reason.message) || event.reason);
  });

  var isFile = location.protocol === 'file:';
  document.documentElement.dataset.mode = isFile ? 'file' : 'server';

  function showWarning() {
    var warn = document.getElementById('fileWarning');
    if (warn && isFile) warn.hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showWarning);
  else showWarning();

  window.__APOLLO_HEALTH__ = function () {
    var video = document.createElement('video');
    var mime = '';
    try {
      mime = window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'webm/vp9' : (window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'webm/vp8' : 'indisponível');
    } catch (_) { mime = 'indisponível'; }
    return {
      mode: isFile ? 'file://' : location.origin,
      crossOriginIsolated: !!self.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      webgpu: !!navigator.gpu,
      mediaRecorder: mime,
      canvasCapture: typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream,
      offlineAudio: !!(window.OfflineAudioContext || window.webkitOfflineAudioContext),
      videoCodecs: {
        h264: !!video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
        vp9: !!video.canPlayType('video/webm; codecs="vp9"'),
      },
      memoryGB: navigator.deviceMemory || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      serviceWorker: !!navigator.serviceWorker,
      errors: errors.slice(-10),
    };
  };
})();
