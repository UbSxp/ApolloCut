/* ============================================================
   APOLLOCUT — Whisper Worker
   Roda o modelo local (vendor/transformers.bundle.mjs) fora da
   thread da interface. Recebe áudio mono 16 kHz (Float32Array).
   ============================================================ */

let libPromise = null;

async function loadLib() {
  if (!libPromise) {
    libPromise = import('/vendor/transformers.bundle.mjs').then((mod) => {
      mod.env.allowLocalModels = false;
      mod.env.allowRemoteModels = true;
      mod.env.useBrowserCache = true;
      // wasm do onnxruntime servido localmente (sem CDN).
      mod.env.backends.onnx.wasm.wasmPaths = '/vendor/ort/';
      mod.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? 2 : 1;
      return mod;
    });
  }
  return libPromise;
}

let cached = { key: '', pipe: null };

async function getPipeline(model, preferWebgpu, onProgress) {
  const device = preferWebgpu && self.navigator?.gpu ? 'webgpu' : 'wasm';
  const dtype = device === 'webgpu' ? 'fp32' : 'q8';
  const key = `${model}|${device}|${dtype}`;
  if (cached.pipe && cached.key === key) return { pipe: cached.pipe, device, model };

  const mod = await loadLib();
  const pipe = await mod.pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (info) => onProgress(info),
  });
  cached = { key, pipe };
  return { pipe, device, model };
}

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type !== 'start') return;

  const { audio, language = 'pt', model = 'onnx-community/whisper-base', preferWebgpu = false } = data;

  const post = (msg) => self.postMessage(msg);

  try {
    if (!(audio instanceof Float32Array) || audio.length < 1600) {
      throw new Error('Áudio vazio ou curto demais para transcrever.');
    }

    const started = performance.now();
    post({ type: 'stage', stage: 'model', pct: 20, note: 'Carregando modelo local…' });

    let result;
    try {
      const { pipe, device } = await getPipeline(model, preferWebgpu, (info) => {
        if (!info) return;
        const total = Number(info.total) || 0;
        const loaded = Number(info.loaded) || 0;
        const pct = total ? Math.min(100, (loaded / total) * 100) : 0;
        post({
          type: 'progress',
          stage: 'model',
          file: info.file || '',
          status: info.status,
          pct,
          loaded,
          total,
        });
      });

      post({ type: 'stage', stage: 'infer', pct: 45, note: `Transcrevendo (${device.toUpperCase()})…` });
      result = await pipe(audio, {
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      post({
        type: 'result',
        text: result.text || '',
        chunks: result.chunks || [],
        model,
        device,
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      // Fallback: modelo menor e/ou CPU.
      if (model !== 'onnx-community/whisper-tiny') {
        post({ type: 'stage', stage: 'model', pct: 25, note: 'Modelo falhou; tentando o modelo menor…' });
        const { pipe, device } = await getPipeline('onnx-community/whisper-tiny', false, (info) => {
          if (!info) return;
          const total = Number(info.total) || 0;
          const loaded = Number(info.loaded) || 0;
          post({ type: 'progress', stage: 'model', file: info.file || '', status: info.status, pct: total ? (loaded / total) * 100 : 0, loaded, total });
        });
        post({ type: 'stage', stage: 'infer', pct: 45, note: `Transcrevendo (${device.toUpperCase()})…` });
        result = await pipe(audio, {
          language: language === 'auto' ? undefined : language,
          task: 'transcribe',
          return_timestamps: true,
          chunk_length_s: 30,
          stride_length_s: 5,
        });
        post({
          type: 'result',
          text: result.text || '',
          chunks: result.chunks || [],
          model: 'onnx-community/whisper-tiny',
          device,
          ms: Math.round(performance.now() - started),
          fallback: true,
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    post({ type: 'error', message: String(error && error.message || error) });
  }
});
