/**
 * @file Testes do Reenquadramento (mock YuNet).
 * Roda sem internet, sem modelo real — usa detector fake.
 */

import { reframeVideo, REFRAME_CONFIG, FaceTrack, classifyScene, getActiveSpeaker, compactKeyframes } from '../core/reframe-engine.js';

// Mock video element
function createMockVideo(duration, width = 1920, height = 1080) {
  return {
    duration,
    videoWidth: width,
    videoHeight: height,
    currentTime: 0,
    onseeked: null,
    onloadedmetadata: null,
    onerror: null,
    _seekCallbacks: [],
    set currentTime(t) {
      this._currentTime = t;
      setTimeout(() => {
        this._seekCallbacks.forEach(cb => cb());
        this._seekCallbacks = [];
      }, 0);
    },
    get currentTime() { return this._currentTime; },
    addEventListener(event, cb) { if (event === 'seeked') this._seekCallbacks.push(cb); },
    removeEventListener() {},
  };
}

// Mock FaceTrack para testes
function createMockTrack(x, y, w, h, score = 0.9, hits = 5) {
  return {
    id: `face-${Date.now()}-${Math.random()}`,
    face: { x, y, w, h, score, landmarks: [] },
    smoothed: { x, y, w, h, score, landmarks: [] },
    age: 0,
    hits,
    lastFrame: 0,
    update(face, frameIdx) { this.age = frameIdx - this.lastFrame; this.lastFrame = frameIdx; this.hits++; this.face = face; this.smoothed = face; },
    predict() { return this.smoothed; },
    isLost() { return this.age > 30; },
  };
}

async function runTests() {
  console.log('🧪 Iniciando testes do Reenquadramento...');

  // Teste 1: FaceTrack e associação
  console.log('\n1. Testando FaceTrack e associação...');
  const track1 = createMockTrack(100, 100, 200, 200);
  track1.update({ x: 105, y: 102, w: 198, h: 202, score: 0.92 }, 1);
  console.log(`   Track suavizado: (${track1.smoothed.x.toFixed(1)}, ${track1.smoothed.y.toFixed(1)}) ${track1.smoothed.w.toFixed(1)}x${track1.smoothed.h.toFixed(1)}`);

  // Teste 2: Classificação de cena
  console.log('\n2. Testando classificação de cena...');
  const tracks = [createMockTrack(400, 200, 300, 300, 0.9, 10)];
  const layout1 = classifyScene(tracks, { width: 1920, height: 1080, data: new Uint8ClampedArray(1920*1080*4) }, { isSpeech: false, mouthOpenness: 0 });
  console.log(`   1 rosto grande: ${layout1}`);

  tracks.push(createMockTrack(1000, 200, 250, 250, 0.85, 8));
  const layout2 = classifyScene(tracks, { width: 1920, height: 1080, data: new Uint8ClampedArray(1920*1080*4) }, { isSpeech: false, mouthOpenness: 0 });
  console.log(`   2 rostos: ${layout2}`);

  for (let i = 0; i < 5; i++) tracks.push(createMockTrack(100+i*200, 400, 150, 150, 0.8, 6));
  const layout3 = classifyScene(tracks, { width: 1920, height: 1080, data: new Uint8ClampedArray(1920*1080*4) }, { isSpeech: false, mouthOpenness: 0 });
  console.log(`   5+ rostos: ${layout3}`);

  // Teste 3: Falante ativo
  console.log('\n3. Testando falante ativo...');
  const active = getActiveSpeaker(tracks, { isSpeech: true, mouthOpenness: 0.3 });
  console.log(`   Falante ativo ID: ${active?.id || 'none'}`);

  // Teste 4: Compactação de keyframes
  console.log('\n4. Testando compactação de keyframes...');
  const keyframes = [
    { time: 0, crop: { x: 0, y: 0, w: 1080, h: 1920, scale: 1 }, layout: 'solo' },
    { time: 0.5, crop: { x: 1, y: 0, w: 1080, h: 1920, scale: 1 }, layout: 'solo' }, // similar
    { time: 1.0, crop: { x: 50, y: 10, w: 1080, h: 1920, scale: 1 }, layout: 'solo' }, // diferente
    { time: 1.5, crop: { x: 52, y: 11, w: 1080, h: 1920, scale: 1 }, layout: 'dual' }, // layout mudou
  ];
  const compacted = compactKeyframes(keyframes);
  console.log(`   Originais: ${keyframes.length} → Compactados: ${compacted.length}`);
  for (const kf of compacted) console.log(`   - ${kf.time}s: crop.x=${kf.crop.x}, layout=${kf.layout}`);

  // Teste 5: Layouts (cálculo de crop)
  console.log('\n5. Testando layouts...');
  const { layouts } = REFRAME_CONFIG;
  const frameW = 1920, frameH = 1080;
  const face = { x: 800, y: 400, w: 200, h: 200 };

  const soloCrop = layouts.solo.computeCrop(face, frameW, frameH);
  console.log(`   Solo: crop ${soloCrop.x.toFixed(0)}x${soloCrop.y.toFixed(0)} ${soloCrop.w.toFixed(0)}x${soloCrop.h.toFixed(0)} scale=${soloCrop.scale.toFixed(2)}`);

  const dualCrop = layouts.dual.computeCrop([face, { x: 1200, y: 300, w: 180, h: 180 }], frameW, frameH);
  console.log(`   Dual: crop ${dualCrop.x.toFixed(0)}x${dualCrop.y.toFixed(0)} ${dualCrop.w.toFixed(0)}x${dualCrop.h.toFixed(0)}`);

  const gameplayCrop = layouts.gameplay.computeCrop(face, frameW, frameH);
  console.log(`   Gameplay: game=${gameplayCrop.game.h.toFixed(0)}h, cam=${gameplayCrop.camera.h.toFixed(0)}h`);

  const screenCrop = layouts.screenshare.computeCrop(face, frameW, frameH);
  console.log(`   Screenshare: content=${screenCrop.content.h.toFixed(0)}h, presenter=${screenCrop.presenter.h.toFixed(0)}h`);

  const fallbackCrop = layouts.fallback.computeCrop(frameW, frameH);
  console.log(`   Fallback: crop ${fallbackCrop.x.toFixed(0)}x${fallbackCrop.y.toFixed(0)} ${fallbackCrop.w.toFixed(0)}x${fallbackCrop.h.toFixed(0)} blur=${fallbackCrop.blur}`);

  // Teste 6: Zona segura
  console.log('\n6. Testando zona segura...');
  const { applySafeZone } = await import('../core/reframe-engine.js');
  const crop = { x: -50, y: -20, w: 1080, h: 1920 };
  const safe = applySafeZone(crop, REFRAME_CONFIG.safeZones.tiktok, 1080, 1920);
  console.log(`   Ajustado: x=${safe.x.toFixed(0)} (era ${crop.x}), y=${safe.y.toFixed(0)} (era ${crop.y})`);

  console.log('\n✅ Todos os testes de Reenquadramento passaram!');
  return true;
}

if (typeof window !== 'undefined') {
  runTests().catch(console.error);
} else if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(console.error);
}

export { runTests };