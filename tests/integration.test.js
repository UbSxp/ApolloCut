import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

/**
 * Integration test: basic DOM structure verification
 * Runs in jsdom with mocked APIs
 */

describe('Integration: basic DOM structure', () => {
  let dom;
  let window;
  let document;
  let consoleSpy;

  beforeEach(() => {
    // Carregar HTML real
    let html = fs.readFileSync(path.resolve('index.html'), 'utf-8');
    // Remover referências externas que causam erros de rede no JSDOM
    html = html.replace(/<link rel="stylesheet" href="styles\.css" \/>/, '<style></style>');
    html = html.replace(/<script src="lib\/captions\.js"><\/script>/, '');
    
    dom = new JSDOM(html, {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      runScripts: 'dangerously',
      resources: 'usable',
      beforeParse(window) {
        // Mock APIs globais
        window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        window.URL.revokeObjectURL = vi.fn();
        window.matchMedia = vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));
        
        // Mock localStorage
        const store = {};
        window.localStorage = {
          getItem: (key) => store[key] || null,
          setItem: (key, value) => { store[key] = value; },
          removeItem: (key) => { delete store[key]; },
          clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        };
        
        // Mock fetch para transformers
        window.fetch = vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
          blob: () => Promise.resolve(new Blob()),
        });
        
        // Mock AudioContext
        window.AudioContext = vi.fn().mockImplementation(() => ({
          decodeAudioData: vi.fn().mockResolvedValue({
            duration: 10,
            sampleRate: 44100,
            numberOfChannels: 2,
            getChannelData: () => new Float32Array(441000),
          }),
          resume: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
          createAnalyser: () => ({
            fftSize: 2048,
            frequencyBinCount: 1024,
            getByteFrequencyData: vi.fn(),
          }),
          createMediaElementSource: () => ({ connect: vi.fn() }),
          destination: {},
        }));
        
        // Mock OffscreenCanvas
        window.OffscreenCanvas = vi.fn().mockImplementation(() => ({
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            fillText: vi.fn(),
            measureText: () => ({ width: 100 }),
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            scale: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            clearRect: vi.fn(),
          }),
          convertToBlob: vi.fn().mockResolvedValue(new Blob()),
        }));
      },
    });
    
    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    global.navigator = window.navigator;
    global.HTMLVideoElement = window.HTMLVideoElement;
    global.HTMLCanvasElement = window.HTMLCanvasElement;
    global.AudioContext = window.AudioContext;
    global.OffscreenCanvas = window.OffscreenCanvas;
    global.URL = window.URL;
    global.matchMedia = window.matchMedia;
    global.localStorage = window.localStorage;
    global.fetch = window.fetch;
    
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
    dom.window.close();
  });

  it('possui elementos essenciais da tela de abertura', () => {
    const opening = document.getElementById('opening');
    const landing = document.getElementById('landing');
    const continueBtn = document.getElementById('openingSkip');
    
    expect(opening).not.toBeNull();
    expect(landing).not.toBeNull();
    expect(continueBtn).not.toBeNull();
  });

  it('possui elementos do studio', () => {
    const studioScreen = document.getElementById('studioScreen');
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    
    expect(studioScreen).not.toBeNull();
    expect(fileInput).not.toBeNull();
    expect(dropzone).not.toBeNull();
  });

  it('possui abas do console com IDs corretos', () => {
    const tabScene = document.getElementById('tabScene');
    const tabCaptions = document.getElementById('tabCaptions');
    const tabPublish = document.getElementById('tabPublish');
    
    expect(tabScene).not.toBeNull();
    expect(tabCaptions).not.toBeNull();
    expect(tabPublish).not.toBeNull();
  });

  it('botões icon-only têm aria-label', () => {
    const iconButtons = document.querySelectorAll('.icon-btn');
    iconButtons.forEach(btn => {
      expect(btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')).toBe(true);
    });
  });

  it('progress bars têm aria-live', () => {
    const progressBars = document.querySelectorAll('[role="progressbar"]');
    progressBars.forEach(bar => {
      expect(bar.getAttribute('aria-live')).toBe('polite');
    });
  });
});