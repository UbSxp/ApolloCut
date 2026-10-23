/* ============================================================
   APOLLOCUT — ateliê de cortes
   Tudo acontece no navegador. Sem upload, sem créditos.
   ============================================================ */

(() => {
  "use strict";

  const $id = (id) => document.getElementById(id);
  const Captions = window.ApolloCaptions;
  if (!Captions) throw new Error("ApolloCaptions não carregado.");
  const {
    parseTimecode,
    parseSubtitles,
    buildGroupsFromCues,
    wordsToGroups,
    groupsFromWhisperChunks,
    sanitizeTranscript,
  } = Captions;
  const ids = `opening openingSkip landing studioScreen studioBack studioBrand newFilmBtn openStudioBtn fileInput srtInput
    dropzone fileName fileMeta studioKind studioStateLabel analysisBadge studioSteps
    frame previewVideo captions frameCaptionNote frameWatermark frameEmpty previewLabel previewFormat
    playBtn seekRange seekMarks timeLabel focusRange focusVal quickCaptionsBtn quickCoverBtn coverBtn kitBtn exportBtn
    lenRange lenLabel countRange countLabel ratioGrid analyzeBtn analysisHint analysisNote
    analysisSummary sumSamples sumSelected sumScore sumNote activeClipInfo activeClipTitle activeClipMeta
    captionStatus captionStatusTitle captionStatusText importSrtBtn whisperBtn styleGrid styleHint
    langSelect brandInput tabScene tabCaptions tabPublish clipsSection clipsMeta clipGrid
    analysisOverlay analysisBar analysisPct analysisStage analysisSheet analysisCounter analysisCancel analysisCancelBtn analysisSub analysisTitle
    whisperOverlay whisperBar whisperPct whisperStage whisperLog whisperWave whisperClip whisperStart whisperCancel whisperClose
    coverOverlay coverCanvas coverTitle coverSub coverPreset coverRandomBtn coverDownload coverClose coverLoading
    exportOverlay exportSub exportThumb exportClipTitle exportClipMeta exportTag burnCaptions sampleExport
    brandWatermarkToggle brandWatermarkLabel exportProgress exportBar exportStatus exportPct exportResult
    exportDone exportFileInfo downloadLink exportStart exportCancel exportClose
    kitOverlay kitTitle kitDescription kitHashtags kitClose kitDownloadCover kitDownloadTxt kitExport
    settingsOverlay settingsClose settingsDone settingsReset themeChoice settingsLang
    ambientToggle reducedMotionToggle soundToggle toasts samplerVideo`;
  const els = {};
  ids.split(/\s+/).filter(Boolean).forEach((id) => { els[id] = $id(id); });

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const STYLE_NAMES = { ode: "Ode", estrofe: "Estrofe", marmore: "Mármore", ditirambo: "Ditirambo" };
  const RATIO_DIMS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
  const WHISPER_LANGS = { pt: "portuguese", en: "english", es: "spanish" };
  const WHISPER_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";
  const WHISPER_MODEL = "onnx-community/whisper-small_timestamped";
  const SETTINGS_KEY = "apollocut.settings.v2";
  const THEME_META = { light: "#f6efe3", dark: "#0c1420" };
  const THEME_MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
  const DEFAULT_SETTINGS = Object.freeze({
    length: 60,
    count: 4,
    ratio: "9:16",
    style: "ode",
    focus: 50,
    lang: "pt",
    brand: "",
    theme: "auto",
    ambient: true,
    reducedMotion: false,
    sound: false,
  });

  const state = {
    file: null,
    url: null,
    ready: false,
    duration: 0,
    width: 0,
    height: 0,
    size: 0,
    clips: [],
    activeId: null,
    exported: false,
    cues: [],
    cueFileName: "",
    cueSource: null,
    analysis: { running: false, cancel: false, samples: [], total: 0, done: 0 },
    audio: { ctx: null, source: null, monitor: null, dest: null },
    capture: { running: false, cancel: false, finish: null, modelPct: 0 },
    whisper: { pipe: null, loading: null, lastProgress: -1 },
    export: { running: false, cancel: false, url: null, recorder: null, actx: null },
    cover: { frame: null, time: 0, token: 0 },
    kit: null,
    ui: { tab: "scene", lastFocus: null },
    settings: { ...DEFAULT_SETTINGS },
    captionView: { group: -1, clipId: null, ref: null },
    playerRaf: 0,
  };

  /* ---------- utilidades ---------- */

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, "0");

  function fmtTime(value) {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }

  function fmtBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function baseName(name) {
    return String(name || "filme").replace(/\.[^.]+$/, "");
  }

  function fileExt(name) {
    const match = String(name || "").match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toUpperCase() : "VÍDEO";
  }

  function toast(message, type = "ok", ms = 4200) {
    const el = document.createElement("div");
    el.className = `toast${type === "error" ? " error" : ""}`;
    el.textContent = message;
    els.toasts.append(el);
    const timer = setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 260);
    }, ms);
    el.addEventListener("click", () => {
      clearTimeout(timer);
      el.classList.add("out");
      setTimeout(() => el.remove(), 220);
    });
  }

  function setRangeFill(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--p", `${clamp(pct, 0, 100)}%`);
  }

  function focusableIn(el) {
    if (!el) return [];
    return [...el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.getClientRects().length > 0);
  }

  function openOverlay(el) {
    if (!el) return;
    state.ui.lastFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      const first = focusableIn(el)[0];
      if (first) first.focus({ preventScroll: true });
    });
  }

  function closeOverlay(el) {
    if (!el) return;
    el.hidden = true;
    if (!document.querySelector(".overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
    const target = state.ui.lastFocus;
    state.ui.lastFocus = null;
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (_) { /* sem armazenamento */ }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      const length = Number(saved.length);
      const count = Number(saved.count);
      const focus = Number(saved.focus);
      if (length >= 15 && length <= 90) state.settings.length = Math.round(length / 5) * 5;
      if (count >= 2 && count <= 8) state.settings.count = Math.round(count);
      if (["9:16", "1:1", "16:9"].includes(saved.ratio)) state.settings.ratio = saved.ratio;
      if (Object.prototype.hasOwnProperty.call(STYLE_NAMES, saved.style)) state.settings.style = saved.style;
      if (Number.isFinite(focus) && focus >= 0 && focus <= 100) state.settings.focus = focus;
      if (["pt", "en", "es", "auto"].includes(saved.lang)) state.settings.lang = saved.lang;
      if (typeof saved.brand === "string") state.settings.brand = saved.brand.slice(0, 32);
      if (["light", "dark", "auto"].includes(saved.theme)) state.settings.theme = saved.theme;
      if (typeof saved.ambient === "boolean") state.settings.ambient = saved.ambient;
      if (typeof saved.reducedMotion === "boolean") state.settings.reducedMotion = saved.reducedMotion;
      if (typeof saved.sound === "boolean") state.settings.sound = saved.sound;
    } catch (_) { /* configuração corrompida, segue o padrão */ }
  }

  /* ---------- estado visual ---------- */

  function sampleCount() {
    if (!state.duration) return 12;
    return clamp(Math.round(state.duration / 60), 12, 48);
  }

  function updateAnalysisHint() {
    if (!state.ready) {
      els.analysisHint.textContent = "aguardando o filme";
      els.analysisNote.textContent = "A leitura usa amostras visuais. Nada é enviado.";
      return;
    }
    const n = sampleCount();
    els.analysisHint.textContent = `${n} amostras`;
    els.analysisNote.textContent = `A leitura usará ${n} quadros distribuídos pelo filme. Nada é enviado.`;
  }

  function setBadge(text, mode = "") {
    const badge = els.analysisBadge;
    badge.classList.remove("is-busy", "is-ready");
    if (mode) badge.classList.add(mode);
    badge.querySelector("span").textContent = text;
    els.studioStateLabel.textContent = text.toUpperCase();
  }

  function updateSteps() {
    const hasClips = state.clips.length > 0;
    const hasCaptions = state.clips.some((c) => c.captionGroups.length > 0);
    const steps = {
      upload: "done",
      analyze: hasClips ? "done" : "active",
      caption: hasClips ? (hasCaptions ? "done" : "active") : "",
      publish: state.exported ? "done" : (hasCaptions ? "active" : ""),
    };
    els.studioSteps.querySelectorAll("li").forEach((li) => {
      li.classList.remove("done", "active");
      const mode = steps[li.dataset.step];
      if (mode) li.classList.add(mode);
    });
  }

  function updateHeaderCta() {
    els.openStudioBtn.textContent = state.ready ? "Voltar ao ateliê" : "Abrir o ateliê";
  }

  function resolvedTheme(pref) {
    return pref === "dark" || (pref === "auto" && THEME_MEDIA.matches) ? "dark" : "light";
  }

  function applyMotionSettings() {
    const root = document.documentElement;
    const reduced = Boolean(state.settings.reducedMotion);
    root.dataset.reducedMotion = reduced ? "true" : "false";
    root.dataset.ambient = state.settings.ambient ? "on" : "off";
    if (els.ambientToggle) els.ambientToggle.checked = state.settings.ambient;
    if (els.reducedMotionToggle) els.reducedMotionToggle.checked = reduced;
    if (els.soundToggle) els.soundToggle.checked = Boolean(state.settings.sound);
  }

  function applyTheme(pref, animate = false) {
    const choice = ["light", "dark", "auto"].includes(pref) ? pref : "auto";
    state.settings.theme = choice;
    const theme = resolvedTheme(choice);
    const dark = theme === "dark";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themePref = choice;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_META[theme]);
    document.querySelectorAll(".js-theme").forEach((button) => {
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Mudar para o dia" : "Mudar para a noite");
      button.setAttribute("title", dark ? "Mudar para o dia" : "Mudar para a noite");
      const use = button.querySelector("use");
      if (use) use.setAttribute("href", dark ? "#i-sun" : "#i-moon");
    });
    document.querySelectorAll("#themeChoice [data-theme-choice]").forEach((button) => {
      const active = button.dataset.themeChoice === choice;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (animate && !state.settings.reducedMotion) {
      root.classList.add("theme-transition");
      window.clearTimeout(applyTheme.timer);
      applyTheme.timer = window.setTimeout(() => root.classList.remove("theme-transition"), 620);
    }
  }

  function toggleTheme() {
    const next = resolvedTheme(state.settings.theme) === "dark" ? "light" : "dark";
    applyTheme(next, true);
    saveSettings();
  }

  function playChime() {
    if (!state.settings.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.5);
      });
      window.setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch (_) { /* som é opcional */ }
  }

  function dismissOpening() {
    if (!els.opening || els.opening.hidden || els.opening.classList.contains("is-leaving")) return;
    els.opening.classList.add("is-leaving");
    els.opening.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      const hadFocus = els.opening.contains(document.activeElement);
      els.opening.hidden = true;
      if (hadFocus && els.openStudioBtn) els.openStudioBtn.focus({ preventScroll: true });
    }, 640);
  }

  function showStudio() {
    if (!state.ready) return;
    els.landing.hidden = true;
    els.studioScreen.hidden = false;
    document.body.classList.add("studio-open");
    updateHeaderCta();
    window.scrollTo(0, 0);
  }

  function showLanding() {
    pausePreview();
    els.studioScreen.hidden = true;
    els.landing.hidden = false;
    document.body.classList.remove("studio-open");
    updateHeaderCta();
    window.scrollTo(0, 0);
  }

  function setTab(tab) {
    if (!["scene", "captions", "publish"].includes(tab)) return;
    state.ui.tab = tab;
    document.querySelectorAll(".console-tab").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.tabScene.hidden = tab !== "scene";
    els.tabCaptions.hidden = tab !== "captions";
    els.tabPublish.hidden = tab !== "publish";
    if (tab === "captions") updateCaptionStatus();
    if (tab === "publish") updatePublishPanel();
  }

  function updatePublishPanel() {
    const clip = currentClip();
    els.coverBtn.disabled = !clip;
    els.kitBtn.disabled = !clip;
    els.exportBtn.disabled = !clip;
  }

  /* ---------- arquivo e metadados ---------- */

  function pickFile() {
    els.fileInput.value = "";
    els.fileInput.click();
  }

  function waitForMetadata(video, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        if (err) reject(err); else resolve();
      };
      const onMeta = () => finish(null);
      const onError = () => finish(new Error("media"));
      const timer = setTimeout(() => finish(new Error("timeout")), timeout);
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError);
    });
  }

  async function resolveVideoDuration(video) {
    if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    try {
      if (video.seekable && video.seekable.length) {
        const end = video.seekable.end(video.seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch (_) {}
    const original = video.currentTime || 0;
    const found = await new Promise((resolve) => {
      let done = false;
      const cleanup = () => {
        video.removeEventListener("durationchange", finish);
        video.removeEventListener("seeked", finish);
        clearTimeout(timer);
      };
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
      };
      const timer = setTimeout(finish, 1800);
      video.addEventListener("durationchange", finish);
      video.addEventListener("seeked", finish);
      try {
        video.currentTime = 1e7;
      } catch (_) {
        finish();
      }
    });
    try { video.currentTime = original; } catch (_) {}
    if (found > 0) return found;
    try {
      if (video.seekable && video.seekable.length) {
        const end = video.seekable.end(video.seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch (_) {}
    return 0;
  }

  function resetFilmState() {
    state.clips = [];
    state.activeId = null;
    state.exported = false;
    state.cues = [];
    state.cueFileName = "";
    state.cueSource = null;
    state.analysis.samples = [];
    state.analysis.cancel = false;
    state.analysis.running = false;
    state.captionView = { group: -1, clipId: null, ref: null };
    els.clipsSection.hidden = true;
    els.clipGrid.replaceChildren();
    els.captions.replaceChildren();
    els.captions.classList.remove("has-caption");
    els.seekMarks.replaceChildren();
    els.frameCaptionNote.hidden = true;
    els.analysisSummary.hidden = true;
    els.activeClipTitle.textContent = "Nenhum corte ainda";
    els.activeClipMeta.textContent = "O filme inteiro está em tela.";
    els.previewLabel.textContent = "O filme inteiro";
    els.captionStatus.className = "caption-status";
    els.captionStatusTitle.textContent = "Sem legendas";
    els.captionStatusText.textContent = "Importe o SRT/VTT que acompanha o filme ou transcreva o corte.";
    els.whisperBtn.disabled = true;
    updateSteps();
  }

  async function loadFile(file) {
    if (!file) return;
    const typeOk = /^video\//i.test(file.type || "") || /\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name);
    if (!typeOk) {
      toast("Escolha um arquivo de vídeo (MP4, MOV ou WebM).", "error");
      return;
    }

    pausePreview();
    resetFilmState();
    const oldUrl = state.url;
    state.file = file;
    state.url = URL.createObjectURL(file);
    state.ready = false;
    state.duration = 0;
    state.width = 0;
    state.height = 0;
    state.size = file.size;

    els.fileName.textContent = baseName(file.name);
    els.studioKind.textContent = fileExt(file.name);
    els.fileMeta.textContent = "Lendo o arquivo…";
    els.frame.classList.remove("ready");
    els.frameEmpty.hidden = false;
    els.frameEmpty.innerHTML = '<span class="loader"></span>Preparando a tela…';
    els.analyzeBtn.disabled = true;
    els.analyzeBtn.textContent = "Ler o filme";
    setBadge("Abrindo o arquivo", "is-busy");
    els.landing.hidden = true;
    els.studioScreen.hidden = false;
    document.body.classList.add("studio-open");
    updateHeaderCta();

    els.previewVideo.src = state.url;
    els.samplerVideo.src = state.url;
    els.previewVideo.load();
    els.samplerVideo.load();

    try {
      await waitForMetadata(els.previewVideo, 30000);
    } catch (_) {
      els.frameEmpty.innerHTML = "O navegador não conseguiu abrir este vídeo.<br>Tente um MP4 com H.264.";
      setBadge("Formato não suportado");
      toast("Este formato não abriu no navegador. Prefira MP4 (H.264).", "error", 7000);
      els.fileMeta.textContent = `${fileExt(file.name)} · ilegível neste navegador`;
      return;
    }

    state.duration = await resolveVideoDuration(els.previewVideo);
    state.width = els.previewVideo.videoWidth || 0;
    state.height = els.previewVideo.videoHeight || 0;

    if (!state.duration || !state.width || !state.height) {
      els.frameEmpty.innerHTML = "O vídeo não informou duração ou dimensões.<br>Tente outro arquivo.";
      setBadge("Vídeo incompleto");
      return;
    }

    state.ready = true;
    els.frame.classList.add("ready");
    els.frameEmpty.hidden = true;
    els.analyzeBtn.disabled = false;
    els.seekRange.max = String(state.duration);
    els.seekRange.value = "0";
    setRangeFill(els.seekRange);
    els.timeLabel.textContent = `00:00 / ${fmtTime(state.duration)}`;
    els.fileMeta.textContent = `${fileExt(file.name)} · ${state.width}×${state.height} · ${fmtTime(state.duration)} · ${fmtBytes(file.size)}`;
    setBadge("Pronto para ler", "is-ready");
    updateAnalysisHint();
    els.previewLabel.textContent = "O filme inteiro";
    els.previewFormat.textContent = state.settings.ratio;
    updatePublishPanel();
    updateSteps();
    updateFocusLabel();
    updateHeaderCta();

    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1500);
    toast("Filme aberto no ateliê. O arquivo não saiu do seu computador.");
  }

  /* ---------- player ---------- */

  function currentClip() {
    return state.clips.find((clip) => clip.id === state.activeId) || null;
  }

  function pausePreview() {
    if (els.previewVideo) {
      try { els.previewVideo.pause(); } catch (_) {}
    }
    if (els.playBtn) els.playBtn.classList.remove("playing");
    if (state.playerRaf) {
      cancelAnimationFrame(state.playerRaf);
      state.playerRaf = 0;
    }
  }

  function seekPreview(time) {
    if (!state.ready) return;
    const t = clamp(Number(time) || 0, 0, Math.max(0, state.duration - 0.02));
    try { els.previewVideo.currentTime = t; } catch (_) {}
    updatePlayerUI(t);
    renderCaptions(t);
  }

  function togglePlay() {
    if (!state.ready) return;
    if (els.previewVideo.paused) {
      const clip = currentClip();
      if (clip && (els.previewVideo.currentTime < clip.start - 0.5 || els.previewVideo.currentTime >= clip.end - 0.05)) {
        seekPreview(clip.start + 0.02);
      }
      if (state.audio.ctx && state.audio.ctx.state === "suspended") {
        state.audio.ctx.resume().catch(() => {});
      }
      els.previewVideo.play().catch(() => {
        toast("Não foi possível iniciar a reprodução.", "error");
      });
    } else {
      pausePreview();
    }
  }

  function updatePlayerUI(time) {
    const t = Number.isFinite(time) ? time : els.previewVideo.currentTime;
    if (document.activeElement !== els.seekRange) {
      els.seekRange.value = String(clamp(t, 0, state.duration || 0));
    }
    setRangeFill(els.seekRange);
    els.timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(state.duration)}`;
    els.playBtn.classList.toggle("playing", !els.previewVideo.paused);
  }

  function playerLoop() {
    if (!state.ready) {
      state.playerRaf = 0;
      return;
    }
    updatePlayerUI(els.previewVideo.currentTime);
    renderCaptions(els.previewVideo.currentTime);
    if (!els.previewVideo.paused && !els.previewVideo.ended) {
      state.playerRaf = requestAnimationFrame(playerLoop);
    } else {
      state.playerRaf = 0;
    }
  }

  function startPlayerLoop() {
    if (state.playerRaf) return;
    state.playerRaf = requestAnimationFrame(playerLoop);
  }

  /* ---------- enquadramento, formato, estilo ---------- */

  function updateFocusLabel() {
    const focus = Number(state.settings.focus);
    const label = focus < 34 ? "esquerda" : focus > 66 ? "direita" : "centro";
    els.focusVal.textContent = label;
    els.frame.style.setProperty("--focus", `${focus}%`);
    setRangeFill(els.focusRange);
  }

  function setRatio(ratio, save = true) {
    if (!RATIO_DIMS[ratio]) return;
    state.settings.ratio = ratio;
    els.frame.classList.remove("r916", "r11", "r169");
    els.frame.classList.add(ratio === "9:16" ? "r916" : ratio === "1:1" ? "r11" : "r169");
    els.previewFormat.textContent = ratio;
    els.ratioGrid.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.ratio === ratio);
    });
    if (save) saveSettings();
  }

  function setStyle(style, save = true) {
    if (!STYLE_NAMES[style]) return;
    state.settings.style = style;
    els.frame.dataset.cap = style;
    els.styleHint.textContent = STYLE_NAMES[style];
    els.styleGrid.querySelectorAll(".style-option").forEach((btn) => {
      const active = btn.dataset.style === style;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    state.captionView = { group: -1, clipId: null, ref: null };
    renderCaptions(els.previewVideo.currentTime || 0);
    if (save) saveSettings();
  }

  function updateWatermark() {
    const brand = state.settings.brand.trim();
    if (brand) {
      els.frameWatermark.textContent = brand;
      els.frameWatermark.hidden = false;
    } else {
      els.frameWatermark.hidden = true;
      els.frameWatermark.textContent = "";
    }
    if (els.brandWatermarkToggle) {
      els.brandWatermarkToggle.disabled = !brand;
      if (!brand) {
        els.brandWatermarkToggle.checked = false;
        els.brandWatermarkLabel.textContent = "sem assinatura";
      } else {
        els.brandWatermarkLabel.textContent = brand;
      }
    }
  }

  /* ---------- seleção de corte ---------- */

  function selectClip(id, seek = true) {
    const clip = state.clips.find((c) => c.id === id);
    if (!clip) return;
    state.activeId = id;
    els.previewLabel.textContent = `Corte ${ROMAN[clip.index]} · ${fmtTime(clip.start)}–${fmtTime(clip.end)}`;
    els.clipGrid.querySelectorAll(".clip-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.id === id);
    });
    els.seekMarks.querySelectorAll(".seek-mark").forEach((mark, index) => {
      mark.classList.toggle("active", index === clip.index);
    });
    if (seek) {
      pausePreview();
      seekPreview(clip.start + 0.02);
    }
    els.captions.replaceChildren();
    els.captions.classList.remove("has-caption");
    state.captionView = { group: -1, clipId: null, ref: null };
    renderCaptions(els.previewVideo.currentTime || 0);
    els.whisperBtn.disabled = state.capture.running;
    updateCaptionStatus();
    updatePublishPanel();
    updateActiveClipInfo();
    updateSteps();
  }

  function updateActiveClipInfo() {
    const clip = currentClip();
    if (!clip) {
      els.activeClipTitle.textContent = "Nenhum corte ainda";
      els.activeClipMeta.textContent = "O filme inteiro está em tela.";
      return;
    }
    els.activeClipTitle.textContent = clip.title;
    els.activeClipMeta.textContent = `${fmtTime(clip.start)}–${fmtTime(clip.end)} · ${Math.round(clip.end - clip.start)} s · ${clip.reason} · ${clip.score}/100`;
  }

  /* ============================================================
     LEITURA VISUAL
     ============================================================ */

  function seekVideo(video, time, timeout = 4000) {
    return new Promise((resolve, reject) => {
      const target = clamp(Number(time) || 0, 0, Math.max(0, (video.duration || 0) - 0.05));
      let done = false;
      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        clearTimeout(timer);
      };
      const finish = (err) => {
        if (done) return;
        done = true;
        cleanup();
        if (err) reject(err); else resolve();
      };
      const onSeeked = () => finish(null);
      const timer = setTimeout(() => finish(new Error("seek-timeout")), timeout);
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = target;
        if (Math.abs(video.currentTime - target) < 0.01 && !video.seeking) {
          setTimeout(() => finish(null), 30);
        }
      } catch (err) {
        finish(err);
      }
    });
  }

  function computeMetrics(imageData, prevLuma) {
    const { data, width, height } = imageData;
    const total = width * height;
    const luma = new Float32Array(total);
    let sum = 0;
    let sumSq = 0;
    let color = 0;
    let edges = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const p = i * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        luma[i] = l;
        sum += l;
        sumSq += l * l;
        color += (Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) / (3 * 255);
        if (x > 0) edges += Math.abs(l - luma[i - 1]);
      }
    }
    const mean = sum / total;
    const variance = Math.max(0, sumSq / total - mean * mean);
    let motion = 0;
    if (prevLuma && prevLuma.length === luma.length) {
      for (let i = 0; i < total; i++) motion += Math.abs(luma[i] - prevLuma[i]);
      motion /= total;
    }
    return {
      brightness: mean,
      contrast: Math.sqrt(variance),
      colorfulness: color / total,
      edges: edges / total,
      motion,
      luma,
    };
  }

  function normalizeSamples(samples) {
    const valid = samples.filter((s) => !s.error && s.metrics);
    if (!valid.length) return;
    const metrics = ["motion", "contrast", "edges", "colorfulness", "brightness"];
    const ranges = {};
    metrics.forEach((key) => {
      const values = valid.map((s) => s.metrics[key] || 0);
      ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
    });
    valid.forEach((s) => {
      s.norm = {};
      metrics.forEach((key) => {
        const range = ranges[key];
        s.norm[key] = range.max > range.min
          ? clamp((s.metrics[key] - range.min) / (range.max - range.min), 0, 1)
          : 0;
      });
      s.composite = clamp(
        s.norm.motion * 0.3 +
        s.norm.contrast * 0.24 +
        s.norm.edges * 0.2 +
        s.norm.colorfulness * 0.14 +
        s.norm.brightness * 0.12,
        0, 1
      );
    });
    const values = valid.map((s) => s.composite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    valid.forEach((s) => {
      s.composite = max > min ? (s.composite - min) / (max - min) : 0;
    });
  }

  function metricReason(sample) {
    if (!sample || !sample.norm) return "distribuição por tempo";
    const entries = [
      ["motion", "movimento"],
      ["contrast", "contraste"],
      ["edges", "textura"],
      ["colorfulness", "cor"],
      ["brightness", "luz"],
    ].sort((a, b) => sample.norm[b[0]] - sample.norm[a[0]]);
    return entries[0][1];
  }

  function setAnalysisProgress(done, total, stage, pct) {
    const value = clamp(pct != null ? pct : (total ? (done / total) * 100 : 0), 0, 100);
    els.analysisBar.style.width = `${value}%`;
    els.analysisPct.textContent = `${Math.round(value)}%`;
    if (stage) els.analysisStage.textContent = stage;
    els.analysisCounter.textContent = `${done} / ${total} quadros`;
  }

  function appendSampleTile(thumb, time) {
    if (!thumb) return;
    const tile = document.createElement("div");
    tile.className = "frame-sample";
    const img = document.createElement("img");
    img.src = thumb;
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = fmtTime(time);
    tile.append(img, label);
    els.analysisSheet.append(tile);
    if (els.analysisSheet.children.length > 48) {
      els.analysisSheet.removeChild(els.analysisSheet.firstElementChild);
    }
  }

  function cancelAnalysis() {
    if (!state.analysis.running) {
      closeOverlay(els.analysisOverlay);
      return;
    }
    state.analysis.cancel = true;
    els.analysisStage.textContent = "Cancelando a leitura…";
  }

  async function startAnalysis() {
    if (!state.ready || state.analysis.running) return;
    const total = sampleCount();
    state.analysis.running = true;
    state.analysis.cancel = false;
    state.analysis.samples = [];
    state.analysis.total = total;
    state.analysis.done = 0;
    pausePreview();
    setBadge("Lendo o filme", "is-busy");
    els.analysisSheet.replaceChildren();
    els.analysisTitle.textContent = "Lendo o filme.";
    els.analysisSub.textContent = "Amostrando quadros e medindo o que se move.";
    setAnalysisProgress(0, total, "Preparando o disco…", 0);
    openOverlay(els.analysisOverlay);
    els.analyzeBtn.disabled = true;

    let prevLuma = null;
    try {
      await waitForMetadata(els.samplerVideo, 15000);
      await resolveVideoDuration(els.samplerVideo);
      const sampler = els.samplerVideo;
      const times = Array.from({ length: total }, (_, i) => (state.duration * (i + 0.5)) / total);
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 108;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      for (let i = 0; i < times.length; i++) {
        if (state.analysis.cancel) break;
        const time = times[i];
        setAnalysisProgress(i, total, `Amostra ${String(i + 1).padStart(2, "0")} · ${fmtTime(time)}`, (i / total) * 100);
        let sample = { time, error: true };
        try {
          await seekVideo(sampler, time, 3500);
          ctx.drawImage(sampler, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const metrics = computeMetrics(imageData, prevLuma);
          prevLuma = metrics.luma;
          const thumbCanvas = document.createElement("canvas");
          thumbCanvas.width = 320;
          thumbCanvas.height = 180;
          const thumbCtx = thumbCanvas.getContext("2d");
          drawCoverCrop(thumbCtx, sampler, thumbCanvas.width, thumbCanvas.height, 50);
          sample = {
            time,
            error: false,
            metrics: {
              brightness: metrics.brightness,
              contrast: metrics.contrast,
              colorfulness: metrics.colorfulness,
              edges: metrics.edges,
              motion: metrics.motion,
            },
            thumb: thumbCanvas.toDataURL("image/jpeg", 0.78),
          };
          appendSampleTile(sample.thumb, time);
        } catch (_) {
          sample = { time, error: true };
          appendSampleTile(null, time);
        }
        state.analysis.samples.push(sample);
        state.analysis.done = i + 1;
        setAnalysisProgress(i + 1, total, `Amostra ${String(i + 1).padStart(2, "0")} · ${fmtTime(time)}`, ((i + 1) / total) * 100);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      if (state.analysis.cancel) {
        state.analysis.running = false;
        closeOverlay(els.analysisOverlay);
        els.analyzeBtn.disabled = false;
        setBadge(state.clips.length ? `${state.clips.length} cortes prontos` : "Leitura cancelada", state.clips.length ? "is-ready" : "");
        toast("Leitura cancelada. Nada foi alterado.");
        return;
      }

      normalizeSamples(state.analysis.samples);
      state.analysis.running = false;
      deriveClips();
      closeOverlay(els.analysisOverlay);
      els.analyzeBtn.disabled = false;
      els.analyzeBtn.textContent = "Reler o filme";
      const valid = state.analysis.samples.filter((s) => !s.error).length;
      if (!valid) {
        toast("Não foi possível amostrar quadros. Os cortes foram distribuídos por tempo.", "error", 6000);
      } else {
        toast(`Leitura concluída: ${valid} quadros, ${state.clips.length} cortes.`);
      }
    } catch (err) {
      state.analysis.running = false;
      closeOverlay(els.analysisOverlay);
      els.analyzeBtn.disabled = false;
      setBadge("A leitura falhou");
      toast("A leitura visual encontrou um erro. Tente novamente.", "error", 6000);
      console.error(err);
    } finally {
      state.analysis.running = false;
      els.analyzeBtn.disabled = !state.ready;
    }
  }

  /* ---------- derivar cortes ---------- */

  function deriveClips() {
    const valid = state.analysis.samples.filter((s) => !s.error && s.norm);
    const len = Math.min(state.settings.length, Math.max(1, state.duration));
    const maxCount = Math.max(1, Math.floor(state.duration / len));
    const wanted = clamp(state.settings.count, 1, 8);
    const count = Math.min(wanted, maxCount);
    const maxStart = Math.max(0, state.duration - len);
    const candidates = [];

    valid.forEach((sample) => {
      const start = clamp(sample.time - len * 0.33, 0, maxStart);
      candidates.push({ start, score: sample.composite, sample });
    });
    candidates.sort((a, b) => b.score - a.score);

    const selected = [];
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      const end = candidate.start + len;
      const clear = selected.every((item) => {
        const itemEnd = item.start + len;
        return candidate.start >= itemEnd + 0.8 || end <= item.start - 0.8;
      });
      if (clear) selected.push({ start: candidate.start, sample: candidate.sample });
    }

    if (selected.length < count) {
      const slots = Math.max(1, count);
      for (let i = 0; i < slots && selected.length < count; i++) {
        const start = slots === 1 ? 0 : (maxStart * i) / (slots - 1);
        const end = start + len;
        const clear = selected.every((item) => {
          const itemEnd = item.start + len;
          return start >= itemEnd + 0.8 || end <= item.start - 0.8;
        });
        if (clear) selected.push({ start, sample: null });
      }
    }

    selected.sort((a, b) => a.start - b.start);
    const chosen = selected.slice(0, count).map((item, index) => {
      const start = clamp(item.start, 0, maxStart);
      const end = Math.min(state.duration, start + len);
      let best = item.sample;
      if (!best) {
        const inWindow = valid
          .filter((sample) => sample.time >= start && sample.time <= end)
          .sort((a, b) => b.composite - a.composite);
        best = inWindow[0] || valid.reduce((closest, sample) => {
          if (!closest) return sample;
          return Math.abs(sample.time - (start + len / 2)) < Math.abs(closest.time - (start + len / 2)) ? sample : closest;
        }, null);
      }
      return {
        id: `clip-${index}-${Math.round(start * 100)}`,
        index,
        start,
        end,
        length: end - start,
        score: best ? Math.round(best.composite * 100) : 0,
        reason: metricReason(best),
        thumb: best ? best.thumb : null,
        title: `Corte ${ROMAN[index]}`,
        captionGroups: [],
        captionSource: null,
      };
    });

    state.clips = chosen;
    state.activeId = chosen[0] ? chosen[0].id : null;
    attachCuesToClips();
    updateClipTitles();
    updateSeekMarks();
    renderClips();
    els.clipsSection.hidden = false;
    updateAnalysisSummary(count, wanted);
    updatePublishPanel();
    updateSteps();
    setBadge(chosen.length ? `${chosen.length} cortes prontos` : "Sem cortes", chosen.length ? "is-ready" : "");
    if (chosen[0]) selectClip(chosen[0].id, true);
    if (chosen.length < wanted) {
      toast(`O filme comporta ${chosen.length} corte${chosen.length > 1 ? "s" : ""} deste tamanho.`, "ok", 5000);
    }
  }

  function updateAnalysisSummary(actualCount, wanted) {
    const valid = state.analysis.samples.filter((s) => !s.error);
    if (!state.clips.length && !valid.length) {
      els.analysisSummary.hidden = true;
      return;
    }
    els.analysisSummary.hidden = false;
    els.sumSamples.textContent = String(valid.length);
    els.sumSelected.textContent = String(state.clips.length);
    const avg = state.clips.length
      ? Math.round(state.clips.reduce((sum, clip) => sum + clip.score, 0) / state.clips.length)
      : 0;
    els.sumScore.textContent = avg ? String(avg) : "—";
    let note = "A leitura priorizou movimento, contraste e mudança de cena. A escolha final é sua.";
    if (actualCount < wanted) {
      note += ` O filme comporta ${actualCount} corte${actualCount > 1 ? "s" : ""} com esta duração.`;
    }
    els.sumNote.textContent = note;
  }

  function updateSeekMarks() {
    els.seekMarks.replaceChildren();
    if (!state.duration) return;
    state.clips.forEach((clip) => {
      const mark = document.createElement("span");
      mark.className = "seek-mark";
      mark.style.left = `${clamp((clip.start / state.duration) * 100, 0, 100)}%`;
      mark.title = `Corte ${ROMAN[clip.index]} · ${fmtTime(clip.start)}`;
      if (clip.id === state.activeId) mark.classList.add("active");
      els.seekMarks.append(mark);
    });
  }

  function renderClips() {
    els.clipGrid.replaceChildren();
    state.clips.forEach((clip) => {
      const card = document.createElement("article");
      card.className = "clip-card";
      card.dataset.id = clip.id;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Abrir ${clip.title}`);

      const thumb = document.createElement("div");
      thumb.className = "clip-thumb";
      if (clip.thumb) {
        const img = document.createElement("img");
        img.src = clip.thumb;
        img.alt = `Quadro do corte ${ROMAN[clip.index]}`;
        thumb.append(img);
      }
      const shade = document.createElement("div");
      shade.className = "thumb-shade";
      thumb.append(shade);

      const badges = document.createElement("div");
      badges.className = "clip-badges";
      const roman = document.createElement("span");
      roman.className = "clip-badge roman";
      roman.textContent = ROMAN[clip.index];
      const score = document.createElement("span");
      score.className = "clip-badge score";
      score.textContent = clip.score ? `${clip.score}/100` : "tempo";
      const time = document.createElement("span");
      time.className = "clip-badge time";
      time.textContent = `${fmtTime(clip.start)} — ${fmtTime(clip.end)}`;
      badges.append(roman, score, time);

      const play = document.createElement("span");
      play.className = "clip-play";
      play.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.4v13.2L19 12 8 5.4z"/></svg>';
      thumb.append(badges, play);

      const body = document.createElement("div");
      body.className = "clip-body";
      const title = document.createElement("h3");
      title.textContent = clip.title;
      const meta = document.createElement("div");
      meta.className = "clip-meta";
      const dur = Math.round(clip.length);
      meta.innerHTML = `<span>${dur} s</span><i></i><span>${clip.reason}</span><i></i><span>${clip.score ? "potencial " + clip.score : "por tempo"}</span>`;

      const stateLine = document.createElement("span");
      stateLine.className = "clip-caption-state";
      if (clip.captionGroups.length) {
        stateLine.textContent = `${clip.captionSource === "whisper" ? "Whisper" : "SRT"} · ${clip.captionGroups.length} blocos`;
      } else {
        stateLine.classList.add("is-empty");
        stateLine.textContent = "sem legendas";
      }

      const actions = document.createElement("div");
      actions.className = "clip-actions";
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-line";
      openBtn.dataset.action = "open";
      openBtn.textContent = "Abrir";
      const coverBtn = document.createElement("button");
      coverBtn.type = "button";
      coverBtn.className = "btn btn-line";
      coverBtn.dataset.action = "cover";
      coverBtn.textContent = "Capa";
      const expBtn = document.createElement("button");
      expBtn.type = "button";
      expBtn.className = "btn btn-gold";
      expBtn.dataset.action = "export";
      expBtn.textContent = "Exportar";
      actions.append(openBtn, coverBtn, expBtn);

      body.append(title, meta, stateLine, actions);
      card.append(thumb, body);
      els.clipGrid.append(card);
    });

    const len = state.clips[0] ? Math.round(state.clips[0].length) : state.settings.length;
    els.clipsMeta.textContent = `${state.clips.length} corte${state.clips.length === 1 ? "" : "s"} de ${len} s · leitura visual local`;
  }

  /* ============================================================
     LEGENDAS: SRT / VTT
     ============================================================ */

  function deriveTitleFromGroups(groups) {
    for (const group of groups) {
      const raw = group.words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
      if (!raw) continue;
      if (/^[\[(].*[\])]$/.test(raw)) continue;
      const clean = raw
        .replace(/^[\s\-–—:;,.!?]+/, "")
        .replace(/[\s,;:.!?]+$/, "")
        .trim();
      if (!clean) continue;
      const words = clean.split(/\s+/);
      let title = words.slice(0, 9).join(" ");
      if (words.length > 9 || clean.length > 64) {
        title = title.replace(/[,;:.!?]+$/, "") + "…";
      }
      return title.charAt(0).toUpperCase() + title.slice(1);
    }
    return "";
  }

  function updateClipTitles() {
    state.clips.forEach((clip) => {
      const derived = deriveTitleFromGroups(clip.captionGroups);
      clip.title = derived || `Corte ${ROMAN[clip.index]}`;
    });
    if (currentClip()) updateActiveClipInfo();
  }

  function attachCuesToClips() {
    if (!state.clips.length) return;
    state.clips.forEach((clip) => {
      if (!state.cues.length) return;
      const groups = buildGroupsFromCues(state.cues, clip.start, clip.end);
      clip.captionGroups = groups;
      clip.captionSource = groups.length ? "srt" : null;
    });
  }

  async function importSrtFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const cues = parseSubtitles(text);
      if (!cues.length) {
        toast("Não encontrei falas neste arquivo. Use um .srt ou .vtt válido.", "error", 6000);
        return;
      }
      state.cues = cues;
      state.cueFileName = file.name;
      state.cueSource = "srt";
      attachCuesToClips();
      updateClipTitles();
      renderClips();
      if (state.activeId) selectClip(state.activeId, false);
      renderCaptions(els.previewVideo.currentTime || 0);
      updateCaptionStatus();
      updateSteps();
      if (!state.clips.length) {
        toast(`${cues.length} falas prontas. Agora leia o filme para alinhá-las aos cortes.`);
      } else {
        const withCaptions = state.clips.filter((clip) => clip.captionGroups.length).length;
        toast(`${cues.length} falas importadas de ${file.name}. ${withCaptions} corte${withCaptions === 1 ? "" : "s"} com legenda.`);
      }
      setTab("captions");
    } catch (err) {
      toast("Não foi possível ler o arquivo de legendas.", "error");
      console.error(err);
    }
  }

  /* ---------- renderização das legendas na tela ---------- */

  function renderCaptions(time) {
    const clip = currentClip();
    if (!state.ready) return;
    if (!clip || !clip.captionGroups.length) {
      els.captions.replaceChildren();
      els.captions.classList.remove("has-caption");
      els.frameCaptionNote.hidden = !(clip && els.previewVideo.paused);
      return;
    }
    const local = Number(time) - clip.start;
    let found = -1;
    for (let i = clip.captionGroups.length - 1; i >= 0; i--) {
      const group = clip.captionGroups[i];
      if (local >= group.start && local <= group.end) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      els.captions.replaceChildren();
      els.captions.classList.remove("has-caption");
      els.frameCaptionNote.hidden = true;
      state.captionView = { group: -1, clipId: clip.id, ref: null };
      return;
    }
    const group = clip.captionGroups[found];
    if (state.captionView.clipId !== clip.id || state.captionView.group !== found) {
      const line = document.createElement("div");
      line.className = "cap-line";
      group.words.forEach((word) => {
        const span = document.createElement("span");
        span.className = "cap-word";
        span.textContent = word.text;
        line.append(span);
      });
      els.captions.replaceChildren(line);
      state.captionView = { group: found, clipId: clip.id, ref: group };
    }
    els.captions.classList.add("has-caption");
    els.frameCaptionNote.hidden = true;
    const spans = els.captions.querySelectorAll(".cap-word");
    group.words.forEach((word, index) => {
      const span = spans[index];
      if (!span) return;
      span.classList.toggle("active", local >= word.start && local <= word.end);
    });
  }

  function updateCaptionStatus() {
    const clip = currentClip();
    const groups = clip ? clip.captionGroups : [];
    els.captionStatus.className = "caption-status";
    if (groups.length) {
      const whisper = clip.captionSource === "whisper";
      els.captionStatus.classList.add(whisper ? "is-whisper" : "is-ready");
      els.captionStatusTitle.textContent = whisper ? "Whisper local" : "SRT alinhado";
      if (whisper) {
        els.captionStatusText.textContent = `${groups.length} blocos neste corte · transcrito no navegador. Revise antes de publicar.`;
      } else {
        const file = state.cueFileName ? ` · ${state.cueFileName}` : "";
        els.captionStatusText.textContent = `${groups.length} blocos neste corte · ${state.cues.length} falas no arquivo${file}.`;
      }
    } else if (state.cues.length) {
      els.captionStatusTitle.textContent = "Sem falas nesta janela";
      els.captionStatusText.textContent = "O SRT importado não tem falas neste corte. Ajuste a janela ou releia o filme.";
    } else {
      els.captionStatusTitle.textContent = "Sem legendas";
      els.captionStatusText.textContent = "Importe o SRT/VTT que acompanha o filme ou transcreva o corte.";
    }
    els.whisperBtn.disabled = !clip || state.capture.running;
    updateSteps();
    updatePublishPanel();
  }

  /* ============================================================
     WHISPER LOCAL
     ============================================================ */

  function logWhisper(message) {
    if (!els.whisperLog) return;
    const line = String(message || "");
    const current = els.whisperLog.textContent;
    els.whisperLog.textContent = current ? `${current}\n${line}` : line;
    const lines = els.whisperLog.textContent.split("\n");
    if (lines.length > 40) {
      els.whisperLog.textContent = lines.slice(-40).join("\n");
    }
    els.whisperLog.scrollTop = els.whisperLog.scrollHeight;
  }

  function setWhisperStage(name, pct, detail) {
    const order = ["capture", "prepare", "model", "write"];
    const index = order.indexOf(name);
    els.whisperOverlay.querySelectorAll(".w-stages li").forEach((li) => {
      const stageIndex = order.indexOf(li.dataset.wstage);
      li.classList.toggle("done", stageIndex < index);
      li.classList.toggle("active", stageIndex === index);
    });
    const value = clamp(Number(pct) || 0, 0, 100);
    els.whisperBar.style.width = `${value}%`;
    els.whisperPct.textContent = `${Math.round(value)}%`;
    if (detail) els.whisperStage.textContent = detail;
  }

  function resetWhisperUI() {
    setWhisperStage("capture", 0, "Aguardando o início.");
    els.whisperOverlay.querySelectorAll(".w-stages li").forEach((li) => li.classList.remove("done", "active"));
    els.whisperLog.textContent = "";
    els.whisperStart.disabled = false;
    els.whisperStart.textContent = "Iniciar transcrição";
    els.whisperCancel.textContent = "Fechar";
    const c = els.whisperWave.getContext("2d");
    c.clearRect(0, 0, els.whisperWave.width, els.whisperWave.height);
  }

  function openWhisper() {
    const clip = currentClip();
    if (!clip) {
      toast("Escolha um corte antes de transcrever.", "error");
      return;
    }
    if (state.capture.running) return;
    if (!state.ready) return;
    state.capture.cancel = false;
    state.capture.modelPct = 0;
    resetWhisperUI();
    els.whisperClip.textContent = `Corte ${ROMAN[clip.index]} · ${fmtTime(clip.start)}–${fmtTime(clip.end)} · ${Math.round(clip.length)} s · ${STYLE_NAMES[state.settings.style]}`;
    logWhisper("Pronto. A captura acontece em tempo real, no seu navegador.");
    openOverlay(els.whisperOverlay);
  }

  function cancelWhisper() {
    if (!state.capture.running) {
      closeOverlay(els.whisperOverlay);
      return;
    }
    state.capture.cancel = true;
    state.capture.runId = (state.capture.runId || 0) + 1;
    if (state.capture.finish) {
      try { state.capture.finish(); } catch (_) {}
    }
    try { els.previewVideo.pause(); } catch (_) {}
    if (state.audio.monitor) state.audio.monitor.gain.value = 1;
    state.capture.running = false;
    els.whisperBtn.disabled = !currentClip();
    closeOverlay(els.whisperOverlay);
    toast("Transcrição cancelada. Nenhuma legenda foi alterada.");
  }

  async function ensureAudioGraph() {
    if (state.audio.ctx) {
      if (state.audio.ctx.state === "suspended") await state.audio.ctx.resume();
      return state.audio;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("AudioContext indisponível");
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(els.previewVideo);
    const monitor = ctx.createGain();
    monitor.gain.value = 1;
    const dest = ctx.createMediaStreamDestination();
    source.connect(monitor);
    monitor.connect(ctx.destination);
    source.connect(dest);
    state.audio = { ctx, source, monitor, dest };
    if (ctx.state === "suspended") await ctx.resume();
    return state.audio;
  }

  function throwIfCancelled(runId) {
    if (state.capture.cancel || runId !== state.capture.runId) {
      throw new Error("cancelled");
    }
  }

  async function captureClipAudio(clip, runId) {
    const audio = await ensureAudioGraph();
    if (audio.ctx.state === "suspended") await audio.ctx.resume();
    audio.monitor.gain.value = 0;
    pausePreview();
    seekPreview(clip.start + 0.02);
    await new Promise((resolve) => setTimeout(resolve, 160));
    throwIfCancelled(runId);
    if (!audio.ctx.createScriptProcessor) throw new Error("captura de áudio indisponível");

    const processor = audio.ctx.createScriptProcessor(4096, 2, 1);
    const mute = audio.ctx.createGain();
    mute.gain.value = 0;
    const chunks = [];
    let capturing = true;
    processor.onaudioprocess = (event) => {
      if (!capturing) return;
      const input = event.inputBuffer;
      const left = input.getChannelData(0);
      const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
      const mono = new Float32Array(left.length);
      for (let i = 0; i < left.length; i += 1) mono[i] = (left[i] + right[i]) * 0.5;
      chunks.push(mono);
    };
    audio.source.connect(processor);
    processor.connect(mute);
    mute.connect(audio.ctx.destination);

    const startedAt = performance.now();
    let playStartedAt = 0;
    try {
      await els.previewVideo.play();
      playStartedAt = performance.now();
    } catch (_) {
      // Mesmo sem áudio audível, a captura pode continuar.
    }

    const target = Math.max(0.5, clip.length);
    state.capture.phase = "capture";
    await new Promise((resolve) => {
      let settled = false;
      const stop = () => {
        if (settled) return;
        settled = true;
        capturing = false;
        try { els.previewVideo.pause(); } catch (_) {}
        try { audio.source.disconnect(processor); } catch (_) {}
        try { processor.disconnect(); } catch (_) {}
        try { mute.disconnect(); } catch (_) {}
        processor.onaudioprocess = null;
        resolve();
      };
      state.capture.finish = stop;
      const started = performance.now();
      const tick = () => {
        if (state.capture.cancel || runId !== state.capture.runId) {
          stop();
          return;
        }
        const elapsed = els.previewVideo.currentTime - (clip.start + 0.02);
        const pct = clamp((elapsed / target) * 100, 0, 100);
        const model = state.capture.modelPct > 0 ? ` · modelo ${Math.round(state.capture.modelPct)}%` : "";
        setWhisperStage(
          "capture",
          pct,
          `Ouvindo o corte · ${Math.min(Math.max(0, Math.round(elapsed)), Math.round(target))} / ${Math.round(target)} s${model}`
        );
        if (
          elapsed >= target - 0.04 ||
          els.previewVideo.ended ||
          performance.now() - started > (target + 30) * 1000
        ) {
          stop();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    state.capture.finish = null;
    throwIfCancelled(runId);
    if (!chunks.length) throw new Error("audio-empty");
    let total = 0;
    for (const chunk of chunks) total += chunk.length;
    if (!total) throw new Error("audio-empty");
    const raw = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }

    const rate = 16000;
    const sourceBuffer = audio.ctx.createBuffer(1, raw.length, audio.ctx.sampleRate);
    sourceBuffer.copyToChannel(raw, 0);
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(sourceBuffer.duration * rate)), rate);
    const source = offline.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    throwIfCancelled(runId);
    setWhisperStage("prepare", 100, "Áudio preparado. Procurando os trechos de fala…");
    return {
      samples: rendered.getChannelData(0).slice(),
      lead: playStartedAt > 0 ? Math.max(0, (playStartedAt - startedAt) / 1000) : 0,
    };
  }

  function drawWaveform(samples) {
    const canvas = els.whisperWave;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(201,164,92,0.08)";
    ctx.fillRect(0, h / 2 - 1, w, 2);
    if (!samples || !samples.length) return;
    const bars = 240;
    const step = Math.max(1, Math.floor(samples.length / bars));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * step;
      const end = Math.min(samples.length, start + step);
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
      const height = Math.max(1.5, peak * (h * 0.82));
      const alpha = 0.35 + Math.min(0.55, peak * 1.8);
      ctx.fillStyle = `rgba(201,164,92,${alpha.toFixed(3)})`;
      ctx.fillRect(i * bw + bw * 0.18, h / 2 - height / 2, Math.max(1, bw * 0.64), height);
    }
  }

  function detectSpeechSegments(samples, sampleRate) {
    const frameSize = Math.max(1, Math.round(sampleRate * 0.05));
    const frames = Math.floor(samples.length / frameSize);
    if (frames < 4) return [];
    const energies = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const start = f * frameSize;
      let sum = 0;
      for (let i = start; i < start + frameSize; i++) {
        const value = samples[i];
        sum += value * value;
      }
      energies[f] = Math.sqrt(sum / frameSize);
    }
    const sorted = Array.from(energies).sort((a, b) => a - b);
    const noise = sorted[Math.floor(sorted.length * 0.2)] || 0;
    const threshold = Math.max(0.0045, noise * 1.9);
    const voiced = new Uint8Array(frames);
    for (let f = 0; f < frames; f++) {
      const prev = energies[Math.max(0, f - 1)];
      const next = energies[Math.min(frames - 1, f + 1)];
      const smooth = (prev + energies[f] * 2 + next) / 4;
      voiced[f] = smooth > threshold ? 1 : 0;
    }
    for (let f = 1; f < frames - 1; f++) {
      if (!voiced[f] && voiced[f - 1] && voiced[f + 1]) voiced[f] = 1;
    }

    const raw = [];
    let startFrame = -1;
    for (let f = 0; f < frames; f++) {
      if (voiced[f] && startFrame < 0) startFrame = f;
      if (!voiced[f] && startFrame >= 0) {
        raw.push({ start: startFrame, end: f });
        startFrame = -1;
      }
    }
    if (startFrame >= 0) raw.push({ start: startFrame, end: frames });

    const merged = [];
    for (const part of raw) {
      const start = part.start * 0.05;
      const end = part.end * 0.05;
      const last = merged[merged.length - 1];
      if (last && start - last.end < 0.35) {
        last.end = Math.max(last.end, end);
      } else {
        merged.push({ start, end });
      }
    }

    const segments = [];
    for (const part of merged) {
      if (part.end - part.start < 0.32) continue;
      let start = Math.max(0, part.start - 0.12);
      let end = Math.min(samples.length / sampleRate, part.end + 0.12);
      while (end - start > 12) {
        let cut = start + 12;
        let cutFrame = Math.floor(cut / 0.05);
        let best = cut;
        let bestEnergy = Infinity;
        for (let f = Math.max(0, cutFrame - 40); f < Math.min(frames, cutFrame + 40); f++) {
          if (energies[f] < bestEnergy) {
            bestEnergy = energies[f];
            best = Math.max(start + 4, Math.min(start + 12, f * 0.05));
          }
        }
        segments.push({ start, end: best });
        start = best;
      }
      if (end - start >= 0.32) segments.push({ start, end });
    }
    return segments;
  }


  async function getTranscriber() {
    if (state.whisper.pipe) return state.whisper.pipe;
    if (state.whisper.loading) return state.whisper.loading;
    state.whisper.loading = (async () => {
      logWhisper("Importando o motor de transcrição local…");
      const mod = await import(WHISPER_CDN);
      logWhisper("Baixando o modelo Whisper de alta precisão (só na primeira vez)…");
      const pipe = await mod.pipeline("automatic-speech-recognition", WHISPER_MODEL, {
        dtype: "q8",
        progress_callback: (progress) => {
          if (progress && progress.status === "progress" && progress.progress != null) {
            const pct = Math.round(progress.progress);
            state.capture.modelPct = pct;
            if (pct >= state.whisper.lastProgress + 12) {
              state.whisper.lastProgress = pct;
              logWhisper(`${progress.file || "modelo"} · ${pct}%`);
            }
            if (state.capture.phase === "model" && !els.whisperOverlay.hidden) {
              setWhisperStage("model", pct, `Afinando o modelo local · ${pct}%`);
            }
          } else if (progress && progress.status === "ready") {
            logWhisper("Modelo local pronto.");
          }
        },
      });
      state.whisper.pipe = pipe;
      state.capture.modelPct = 100;
      logWhisper("Modelo local pronto.");
      return pipe;
    })().catch((error) => {
      state.whisper.loading = null;
      throw error;
    });
    return state.whisper.loading;
  }

  async function runWhisper() {
    if (state.capture.running) return;
    const clip = currentClip();
    if (!clip) {
      toast("Escolha um corte antes de transcrever.", "error");
      return;
    }
    if (!state.ready) return;

    state.capture.running = true;
    state.capture.cancel = false;
    state.capture.runId = (state.capture.runId || 0) + 1;
    const runId = state.capture.runId;
    state.capture.phase = "capture";
    state.capture.modelPct = 0;
    state.whisper.lastProgress = -1;
    els.whisperStart.disabled = true;
    els.whisperStart.textContent = "Transcrevendo…";
    els.whisperCancel.textContent = "Cancelar";
    els.whisperLog.textContent = "";
    logWhisper("Preparando a captura do áudio…");
    setWhisperStage("capture", 0, "Ouvindo o corte em tempo real…");

    try {
      const capture = await captureClipAudio(clip, runId);
      const audio = capture.samples;
      const timelineOffset = 0.02 - capture.lead;
      throwIfCancelled(runId);
      drawWaveform(audio);
      if (capture.lead > 0.05) {
        logWhisper(`Compensando ${Math.round(capture.lead * 1000)} ms de latência da captura.`);
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      state.capture.phase = "model";
      if (state.capture.modelPct < 100) {
        setWhisperStage("model", state.capture.modelPct, `Afinando o modelo local · ${state.capture.modelPct}%`);
      } else {
        setWhisperStage("model", 100, "Modelo local em cache.");
      }
      const pipe = await getTranscriber();
      throwIfCancelled(runId);
      setWhisperStage("write", 0, "Transcrevendo o corte.");
      const language = state.settings.lang && state.settings.lang !== "auto"
        ? WHISPER_LANGS[state.settings.lang]
        : undefined;
      const options = {
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
        stride_length_s: 5,
      };
      if (language) options.language = language;
      let out = null;
      try {
        out = await pipe(audio, options);
      } catch (error) {
        logWhisper("Tempos por palavra indisponíveis; usando transcrição contínua.");
        out = await pipe(audio, {
          task: "transcribe",
          chunk_length_s: 30,
          stride_length_s: 5,
          ...(language ? { language } : {}),
        });
      }
      throwIfCancelled(runId);
      setWhisperStage("write", 90, "Montando os blocos de legenda.");
      const rawText = out && out.text
        ? String(out.text)
        : (Array.isArray(out && out.chunks) ? out.chunks.map((chunk) => chunk.text || "").join(" ") : "");
      const cleanText = sanitizeTranscript(rawText);
      if (!cleanText) throw new Error("no-speech");
      const preview = cleanText.length > 72 ? `${cleanText.slice(0, 72)}...` : cleanText;
      logWhisper(`Transcrição: "${preview}"`);
      const allGroups = groupsFromWhisperChunks(out && out.chunks, {
        timelineOffset,
        clipLength: clip.length,
        fallbackStart: 0,
        fallbackEnd: audio.length / 16000,
        maxWords: 4,
        maxChars: 28,
      });
      if (Array.isArray(out.chunks) && out.chunks.some((chunk) => Array.isArray(chunk.timestamp))) {
        logWhisper(`Tempos de palavra do modelo: ${out.chunks.length}.`);
      }
      if (!allGroups.length) {
        const segments = detectSpeechSegments(audio, 16000);
        const fallbackEnd = Math.min(clip.length, audio.length / 16000);
        const fallback = wordsToGroups(
          cleanText,
          Math.max(0, timelineOffset),
          fallbackEnd + timelineOffset,
          { maxWords: 4, maxChars: 28 }
        );
        allGroups.push(...fallback.filter((group) => group.start < clip.length && group.end > 0));
        logWhisper(`${segments.length} trechos de fala usados como referência.`);
      }
      throwIfCancelled(runId);
      if (!allGroups.length) throw new Error("empty");
      allGroups.sort((a, b) => a.start - b.start);
      clip.captionGroups = allGroups;
      clip.captionSource = "whisper";
      updateClipTitles();
      renderClips();
      selectClip(clip.id, false);
      pausePreview();
      seekPreview(clip.start + 0.12);
      updateCaptionStatus();
      updateSteps();
      setWhisperStage("write", 100, "Legendas prontas.");
      els.whisperStart.textContent = "Concluído";
      els.whisperCancel.textContent = "Fechar";
      logWhisper(`${allGroups.length} blocos de legenda escritos.`);
      toast(`Legendas reais: ${allGroups.length} blocos transcritos no seu computador.`, "ok", 6000);
      setTimeout(() => {
        if (runId === state.capture.runId) {
          closeOverlay(els.whisperOverlay);
        }
      }, 1200);
    } catch (error) {
      if (error && error.message === "cancelled") {
        return;
      }
      console.error(error);
      if (error && error.message === "no-speech") {
        logWhisper("Nenhuma fala detectada neste corte.");
        toast("Não encontramos fala neste corte. Se você tem o SRT, importe-o.", "error", 6500);
      } else if (error && error.message === "empty") {
        logWhisper("O modelo não devolveu texto.");
        toast("A transcrição não devolveu texto. Tente outro corte ou importe o SRT.", "error", 6500);
      } else {
        logWhisper(`Falha: ${error && error.message ? error.message : "modelo indisponível"}`);
        toast("A transcrição local falhou. Confira a internet do primeiro download ou use o SRT.", "error", 7000);
      }
      if (runId === state.capture.runId) {
        els.whisperStart.disabled = false;
        els.whisperStart.textContent = "Tentar novamente";
        els.whisperCancel.textContent = "Fechar";
      }
    } finally {
      if (runId === state.capture.runId) {
        state.capture.running = false;
        if (state.audio.monitor) state.audio.monitor.gain.value = 1;
        state.capture.finish = null;
        els.whisperBtn.disabled = !currentClip();
        if (els.whisperStart.textContent === "Transcrevendo…") {
          els.whisperStart.disabled = false;
          els.whisperStart.textContent = "Iniciar transcrição";
        }
      }
    }
  }

  /* ============================================================
     DESENHO: CAPA E QUADROS
     ============================================================ */

  function roundRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  function drawCoverCrop(ctx, source, dw, dh, focus = 50) {
    const vw = source.videoWidth || source.width || 0;
    const vh = source.videoHeight || source.height || 0;
    if (!vw || !vh) return;
    const targetAspect = dw / dh;
    const sourceAspect = vw / vh;
    let sw = vw;
    let sh = vh;
    let sx = 0;
    let sy = 0;
    if (sourceAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) * clamp(focus, 0, 100) / 100;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  }

  async function loadCanvasFonts() {
    try {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('600 96px "Cormorant Garamond"'),
        document.fonts.load('700 96px "Cinzel"'),
        document.fonts.load('800 96px "Manrope"'),
      ]);
    } catch (_) { /* as fontes de sistema seguram o desenho */ }
  }

  function drawSun(ctx, cx, cy, radius, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, radius * 0.025);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.8;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const inner = radius * 1.55;
      const outer = radius * (i % 2 === 0 ? 2 : 1.78);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLaurelBranch(ctx, x, y, length, flip, color, alpha = 0.8) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, length * 0.018);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(length * 0.55, -length * 0.2, length, -length * 0.52);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const t = (i + 1) / 8.5;
      const px = 2 * (1 - t) * t * (length * 0.55) + t * t * length;
      const py = 2 * (1 - t) * t * (-length * 0.2) + t * t * (-length * 0.52);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.72 + i * 0.13);
      ctx.beginPath();
      ctx.ellipse(length * 0.055, 0, length * 0.085, length * 0.026, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMeanderLine(ctx, x, y, width, height, color) {
    const unit = height * 2.4;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, height * 0.11);
    ctx.beginPath();
    const count = Math.max(1, Math.floor(width / unit));
    for (let i = 0; i < count; i++) {
      const ox = x + i * unit + unit * 0.12;
      ctx.moveTo(ox, y + height);
      ctx.lineTo(ox, y);
      ctx.lineTo(ox + unit * 0.7, y);
      ctx.lineTo(ox + unit * 0.7, y + height * 0.62);
      ctx.lineTo(ox + unit * 0.32, y + height * 0.62);
      ctx.lineTo(ox + unit * 0.32, y + height * 0.3);
      ctx.lineTo(ox + unit * 0.5, y + height * 0.3);
    }
    ctx.stroke();
    ctx.restore();
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function coverPalette(preset) {
    if (preset === "marmore") {
      return {
        overlay: "rgba(242,236,223,0.9)",
        text: "#17130f",
        accent: "#8b6420",
        sub: "#5f5546",
        border: "rgba(23,19,15,0.5)",
        shadow: false,
        filter: "grayscale(0.55) contrast(0.9) brightness(1.08)",
      };
    }
    if (preset === "terracota") {
      return {
        overlay: "rgba(121,48,24,0.76)",
        text: "#fff4e3",
        accent: "#f0d3a0",
        sub: "#f0d3a0",
        border: "rgba(240,211,160,0.65)",
        shadow: true,
        filter: "saturate(0.85) contrast(1.05)",
      };
    }
    if (preset === "aurora") {
      return {
        overlay: "rgba(9,38,45,0.72)",
        text: "#f4eee2",
        accent: "#d8b972",
        sub: "#cfc5b2",
        border: "rgba(201,164,92,0.62)",
        shadow: true,
        filter: "saturate(1.1) contrast(0.95)",
      };
    }
    return {
      overlay: "rgba(9,7,4,0.42)",
      text: "#fff8e9",
      accent: "#d5b36d",
      sub: "#d8cbb4",
      border: "rgba(201,164,92,0.62)",
      shadow: true,
      filter: "saturate(0.92) contrast(1.05)",
    };
  }

  /* ---------- capa ---------- */

  async function openCover() {
    const clip = currentClip();
    if (!clip) {
      toast("Escolha um corte antes de criar a capa.", "error");
      return;
    }
    if (!state.ready) return;
    closeOverlay(els.kitOverlay);
    closeOverlay(els.exportOverlay);
    const [w, h] = RATIO_DIMS[state.settings.ratio] || RATIO_DIMS["9:16"];
    els.coverCanvas.width = w;
    els.coverCanvas.height = h;
    els.coverLoading.hidden = false;
    els.coverTitle.value = clip.title;
    els.coverSub.textContent = `Corte ${ROMAN[clip.index]} · ${fmtTime(clip.start)}–${fmtTime(clip.end)} · ${state.settings.ratio}`;
    state.cover.frame = null;
    state.cover.token += 1;
    const token = state.cover.token;
    openOverlay(els.coverOverlay);
    await loadCanvasFonts();
    if (token !== state.cover.token) return;
    try {
      await grabCoverFrame(clip.start + clip.length * 0.38, token);
      renderCover();
    } catch (_) {
      renderCover();
    }
    els.coverLoading.hidden = true;
  }

  async function grabCoverFrame(time, token) {
    await waitForMetadata(els.samplerVideo, 10000);
    const safeTime = clamp(time, 0, Math.max(0, state.duration - 0.05));
    await seekVideo(els.samplerVideo, safeTime, 5000);
    if (token !== state.cover.token) return;
    const [w, h] = RATIO_DIMS[state.settings.ratio] || RATIO_DIMS["9:16"];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b0907";
    ctx.fillRect(0, 0, w, h);
    drawCoverCrop(ctx, els.samplerVideo, w, h, state.settings.focus);
    state.cover.frame = canvas;
    state.cover.time = safeTime;
  }

  function renderCover() {
    const canvas = els.coverCanvas;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const preset = els.coverPreset.value || "noite";
    const palette = coverPalette(preset);
    const portrait = h > w;
    const clip = currentClip();

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0907";
    ctx.fillRect(0, 0, w, h);

    if (state.cover.frame) {
      ctx.save();
      ctx.filter = palette.filter;
      ctx.drawImage(state.cover.frame, 0, 0, w, h);
      ctx.restore();
    } else {
      const fallback = ctx.createLinearGradient(0, 0, w, h);
      fallback.addColorStop(0, "#1d2b2b");
      fallback.addColorStop(0.55, "#2b2118");
      fallback.addColorStop(1, "#0b0907");
      ctx.fillStyle = fallback;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.fillStyle = palette.overlay;
    ctx.fillRect(0, 0, w, h);

    const shade = ctx.createLinearGradient(0, h * 0.38, 0, h);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.62, "rgba(0,0,0,0.18)");
    shade.addColorStop(1, "rgba(0,0,0,0.62)");
    if (palette.shadow) {
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
    }

    const inset = w * 0.045;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = Math.max(2, w * 0.0032);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.lineWidth = Math.max(1, w * 0.0012);
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(inset * 1.5, inset * 1.5, w - inset * 3, h - inset * 3);
    ctx.globalAlpha = 1;

    const sunY = h * (portrait ? 0.13 : 0.16);
    const sunR = Math.min(w, h) * (portrait ? 0.057 : 0.066);
    drawSun(ctx, w / 2, sunY, sunR, palette.accent, 0.92);
    drawLaurelBranch(ctx, w / 2 - sunR * 1.5, sunY + sunR * 0.65, sunR * 3.2, true, palette.accent, 0.7);
    drawLaurelBranch(ctx, w / 2 + sunR * 1.5, sunY + sunR * 0.65, sunR * 3.2, false, palette.accent, 0.7);

    const labelSize = Math.max(16, Math.round(w * 0.022));
    ctx.save();
    ctx.fillStyle = palette.accent;
    ctx.font = `600 ${labelSize}px "Manrope", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(labelSize * 0.28)}px`;
    ctx.fillText(`APOLLOCUT · CORTE ${clip ? ROMAN[clip.index] : "I"}`, w / 2, sunY + sunR * 3.25);
    ctx.restore();

    const title = (els.coverTitle.value || (clip ? clip.title : "Corte I")).trim();
    let fontSize = Math.min(w * 0.096, h * 0.105);
    const maxWidth = w * 0.8;
    let lines = [];
    const fontFor = (size) => `600 ${Math.round(size)}px "Cormorant Garamond", Georgia, serif`;
    for (let attempt = 0; attempt < 9; attempt++) {
      ctx.font = fontFor(fontSize);
      lines = wrapCanvasText(ctx, title, maxWidth);
      if (lines.length <= 3) break;
      fontSize *= 0.9;
    }
    if (!lines.length) lines = ["Corte"];
    const lineHeight = fontSize * 1.02;
    const titleCenter = h * (portrait ? 0.5 : 0.49);
    const firstY = titleCenter - ((lines.length - 1) * lineHeight) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.text;
    ctx.font = fontFor(fontSize);
    if (palette.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = fontSize * 0.15;
      ctx.shadowOffsetY = fontSize * 0.03;
    }
    lines.forEach((line, index) => {
      ctx.fillText(line, w / 2, firstY + index * lineHeight);
    });
    ctx.restore();

    const ruleWidth = w * 0.13;
    const ruleY = titleCenter + ((lines.length - 1) * lineHeight) / 2 + lineHeight * 0.85;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(1, w * 0.0016);
    ctx.beginPath();
    ctx.moveTo(w / 2 - ruleWidth / 2, ruleY);
    ctx.lineTo(w / 2 + ruleWidth / 2, ruleY);
    ctx.stroke();

    const brand = state.settings.brand.trim() || "APOLLOCUT";
    const footSize = Math.max(15, Math.round(w * 0.023));
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = palette.text;
    ctx.font = `600 ${footSize}px "Manrope", sans-serif`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(footSize * 0.22)}px`;
    ctx.fillText(brand.toUpperCase(), w / 2, h * 0.865);
    ctx.restore();

    const smallSize = Math.max(14, Math.round(w * 0.018));
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = palette.sub;
    ctx.font = `500 ${smallSize}px "Manrope", sans-serif`;
    ctx.fillText(
      `${fmtTime(clip ? clip.start : 0)} — ${fmtTime(clip ? clip.end : 0)}  ·  ${state.settings.ratio}`,
      w / 2,
      h * 0.905
    );
    ctx.restore();

    drawMeanderLine(ctx, w * 0.31, h * 0.925, w * 0.38, h * 0.012, palette.accent);
  }

  function downloadCover() {
    const clip = currentClip();
    els.coverCanvas.toBlob((blob) => {
      if (!blob) {
        toast("Não foi possível gerar a capa.", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `apollocut-capa-${clip ? ROMAN[clip.index] : "I"}-${state.settings.ratio.replace(":", "x")}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Capa em PNG baixada.");
    }, "image/png");
  }

  /* ============================================================
     FICHA DE PUBLICAÇÃO
     ============================================================ */

  const STOPWORDS = new Set((
    "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se " +
    "é foi ser são está estão como mais mas já não sim muito pouco isso isto aquilo " +
    "the of and to in on for with without that this these those is are was were be been " +
    "you your we our they their it its as at from by or not but have has had will would " +
    "el la los las de del en un una unos unas que por para con sin como más pero ya no sí " +
    "es son está están muy poco esto eso aquello su sus al lo le les"
  ).split(/\s+/).filter(Boolean));

  function stripAccents(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function extractKeywords(transcript) {
    const counts = new Map();
    const words = stripAccents(transcript)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
    words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([word]) => `#${word}`);
  }

  function deriveKit(clip) {
    const transcript = clip.captionGroups
      .flatMap((group) => group.words.map((word) => word.text))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const title = clip.title || `Corte ${ROMAN[clip.index]}`;
    let excerpt = "";
    if (transcript) {
      const sentences = transcript.match(/[^.!?]+[.!?]?/g) || [transcript];
      excerpt = sentences.slice(0, 2).join(" ").trim();
      if (excerpt.length > 220) excerpt = `${excerpt.slice(0, 217).trim()}…`;
    }
    const film = baseName(state.file ? state.file.name : "filme");
    const description = `${excerpt || `Um corte de “${film}”.`}\n\nCorte de “${film}” · ${fmtTime(clip.start)}–${fmtTime(clip.end)} · ${state.settings.ratio}.\nFeito no ApolloCut.`;
    const keywords = extractKeywords(transcript);
    const hashtags = Array.from(new Set(["#apollocut", "#shorts", "#cortes", ...keywords])).join(" ");
    return { title, description, hashtags, clip };
  }

  function openKit() {
    const clip = currentClip();
    if (!clip) {
      toast("Escolha um corte antes de montar a ficha.", "error");
      return;
    }
    closeOverlay(els.coverOverlay);
    closeOverlay(els.exportOverlay);
    state.kit = deriveKit(clip);
    els.kitTitle.textContent = state.kit.title;
    els.kitDescription.textContent = state.kit.description;
    els.kitHashtags.textContent = state.kit.hashtags;
    openOverlay(els.kitOverlay);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
      } catch (_) {
        return false;
      }
    }
  }

  function downloadKit() {
    const kit = state.kit;
    const clip = currentClip();
    if (!kit || !clip) return;
    const text = [
      "TÍTULO",
      kit.title,
      "",
      "DESCRIÇÃO",
      kit.description,
      "",
      "HASHTAGS",
      kit.hashtags,
      "",
      "---",
      `Fonte: ${state.file ? state.file.name : "—"}`,
      `Corte: ${fmtTime(clip.start)}–${fmtTime(clip.end)}`,
      `Formato: ${state.settings.ratio}`,
      "Gerado no ApolloCut. Nenhum upload.",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `apollocut-ficha-${ROMAN[clip.index]}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Ficha baixada em .txt.");
  }

  /* ============================================================
     EXPORTAÇÃO
     ============================================================ */

  function chooseExportMime() {
    if (!window.MediaRecorder) return "";
    const candidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function updateExportTag() {
    const clip = currentClip();
    const sample = els.sampleExport.checked;
    const duration = clip ? (sample ? Math.min(12, clip.length) : clip.length) : 0;
    els.exportTag.textContent = `${state.settings.ratio} · ${Math.round(duration)} s`;
    if (clip) {
      els.exportSub.textContent = `Corte ${ROMAN[clip.index]} · ${fmtTime(clip.start)}–${fmtTime(clip.end)} · ${clamp(state.settings.focus, 0, 100) < 34 ? "enquadramento à esquerda" : clamp(state.settings.focus, 0, 100) > 66 ? "enquadramento à direita" : "enquadramento central"}`;
    }
  }

  function resetExportUI() {
    els.exportProgress.hidden = true;
    els.exportResult.hidden = true;
    els.exportBar.style.width = "0%";
    els.exportPct.textContent = "0%";
    els.exportStatus.textContent = "Preparando…";
    els.exportStart.disabled = false;
    els.exportStart.textContent = "Renderizar corte";
    els.exportCancel.textContent = "Fechar";
    els.downloadLink.removeAttribute("href");
    els.exportFileInfo.textContent = "—";
  }

  function openExport() {
    const clip = currentClip();
    if (!clip) {
      toast("Escolha um corte antes de exportar.", "error");
      return;
    }
    if (!state.ready) return;
    closeOverlay(els.coverOverlay);
    closeOverlay(els.kitOverlay);
    resetExportUI();
    els.exportThumb.style.backgroundImage = clip.thumb ? `url("${clip.thumb}")` : "";
    els.exportClipTitle.textContent = clip.title;
    els.exportClipMeta.textContent = `${fmtTime(clip.start)}–${fmtTime(clip.end)} · ${Math.round(clip.length)} s · ${STYLE_NAMES[state.settings.style]}`;
    els.burnCaptions.disabled = !clip.captionGroups.length;
    els.burnCaptions.checked = Boolean(clip.captionGroups.length);
    const brand = state.settings.brand.trim();
    els.brandWatermarkToggle.disabled = !brand;
    els.brandWatermarkToggle.checked = Boolean(brand);
    updateWatermark();
    updateExportTag();
    openOverlay(els.exportOverlay);
  }

  function updateExportProgress(pct, label) {
    const value = clamp(Number(pct) || 0, 0, 100);
    els.exportBar.style.width = `${value}%`;
    els.exportPct.textContent = `${Math.round(value)}%`;
    if (label) els.exportStatus.textContent = label;
  }

  function drawExportFrame(canvas, video, clip, local, options) {
    const ctx = canvas.getContext("2d", { alpha: false });
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    drawCoverCrop(ctx, video, w, h, state.settings.focus);

    const shade = ctx.createLinearGradient(0, h * 0.5, 0, h);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.62, "rgba(0,0,0,0.22)");
    shade.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    if (options.captions && clip.captionGroups.length) {
      let group = null;
      for (let i = clip.captionGroups.length - 1; i >= 0; i--) {
        const candidate = clip.captionGroups[i];
        if (local >= candidate.start && local <= candidate.end) {
          group = candidate;
          break;
        }
      }
      if (group) drawCanvasCaptionGroup(ctx, w, h, group, local, options.style);
    }

    if (options.watermark && state.settings.brand.trim()) {
      drawCanvasWatermark(ctx, w, h, state.settings.brand.trim());
    }
  }

  function drawCanvasCaptionGroup(ctx, w, h, group, local, styleKey) {
    const styles = {
      ode: {
        family: '"Cinzel", Georgia, serif',
        weight: 700,
        upper: true,
        text: "#fff9ec",
        bg: "#c9a45c",
        activeText: "#17130f",
        underline: false,
        spacing: 0.006,
        scale: 0.92,
      },
      estrofe: {
        family: '"Cormorant Garamond", Georgia, serif',
        weight: 600,
        upper: false,
        text: "#fff8e9",
        bg: null,
        activeText: "#ffffff",
        underline: true,
        spacing: 0,
        scale: 1.06,
      },
      marmore: {
        family: '"Manrope", sans-serif',
        weight: 800,
        upper: true,
        text: "#ffffff",
        bg: "#f4eee2",
        activeText: "#17130f",
        underline: false,
        spacing: 0.01,
        scale: 0.94,
      },
      ditirambo: {
        family: '"Manrope", sans-serif',
        weight: 800,
        upper: true,
        text: "#fff4e3",
        bg: "#a84e2c",
        activeText: "#fff4e3",
        underline: false,
        spacing: 0.01,
        scale: 0.92,
      },
    };
    const st = styles[styleKey] || styles.ode;
    let fontSize = Math.min(w * 0.074, h * 0.096) * st.scale;
    const maxWidth = w * 0.84;
    const words = group.words.map((word) => ({
      ...word,
      text: st.upper ? word.text.toUpperCase() : word.text,
    }));
    const setFont = (size) => {
      ctx.font = `${st.weight} ${Math.round(size)}px ${st.family}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${(size * st.spacing).toFixed(2)}px`;
    };

    let lines = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      setFont(fontSize);
      lines = [];
      let line = [];
      let lineWidth = 0;
      const space = ctx.measureText(" ").width;
      for (const word of words) {
        const width = ctx.measureText(word.text).width;
        const add = line.length ? space + width : width;
        if (line.length && lineWidth + add > maxWidth) {
          lines.push(line);
          line = [word];
          lineWidth = width;
        } else {
          line.push(word);
          lineWidth += add;
        }
      }
      if (line.length) lines.push(line);
      if (lines.length <= 2) break;
      fontSize *= 0.9;
    }
    if (!lines.length) return;

    const lineHeight = fontSize * 1.12;
    const portrait = h >= w;
    const bottomCenter = h * (portrait ? 0.805 : 0.835);
    const firstY = bottomCenter - ((lines.length - 1) * lineHeight) / 2;
    const space = ctx.measureText(" ").width;
    const padX = fontSize * 0.13;
    const padY = fontSize * 0.075;

    setFont(fontSize);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    lines.forEach((line, lineIndex) => {
      const widths = line.map((word) => ctx.measureText(word.text).width);
      const total = widths.reduce((sum, width) => sum + width, 0) + space * (line.length - 1);
      let x = (w - total) / 2;
      const y = firstY + lineIndex * lineHeight;

      line.forEach((word, index) => {
        const width = widths[index];
        const active = local >= word.start - 0.015 && local <= word.end + 0.015;

        if (active && st.bg) {
          ctx.save();
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.fillStyle = st.bg;
          roundRect(
            ctx,
            x - padX,
            y - fontSize * 0.53,
            width + padX * 2,
            fontSize * 1.06,
            fontSize * 0.11
          );
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        if (!active || !st.bg) {
          ctx.shadowColor = "rgba(0,0,0,0.78)";
          ctx.shadowBlur = fontSize * 0.16;
          ctx.shadowOffsetY = fontSize * 0.035;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = active ? st.activeText : st.text;
        ctx.font = `${st.weight} ${Math.round(fontSize)}px ${st.family}`;
        if ("letterSpacing" in ctx) ctx.letterSpacing = `${(fontSize * st.spacing).toFixed(2)}px`;
        ctx.fillText(word.text, x, y);
        ctx.restore();

        if (active && st.underline) {
          ctx.save();
          ctx.strokeStyle = "#c9a45c";
          ctx.lineWidth = Math.max(2, fontSize * 0.055);
          ctx.beginPath();
          ctx.moveTo(x, y + fontSize * 0.34);
          ctx.lineTo(x + width, y + fontSize * 0.34);
          ctx.stroke();
          ctx.restore();
        }

        x += width + space;
      });
    });

    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  function drawCanvasWatermark(ctx, w, h, brand) {
    const size = Math.max(15, Math.round(w * 0.019));
    const x = w * 0.055;
    const y = h * 0.055;
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawSun(ctx, x + size * 0.7, y, size * 0.55, "#c9a45c", 0.95);
    ctx.fillStyle = "rgba(255,248,233,0.9)";
    ctx.font = `700 ${size}px "Manrope", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(size * 0.18)}px`;
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = size * 0.5;
    ctx.fillText(brand.toUpperCase(), x + size * 1.9, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();
  }

  function finishExport(blob, mime, duration, clip, sample) {
    const ext = /mp4/i.test(mime) ? "mp4" : "webm";
    const name = `apollocut-corte-${ROMAN[clip.index]}-${state.settings.ratio.replace(":", "x")}${sample ? "-amostra" : ""}.${ext}`;
    if (state.export.url) {
      URL.revokeObjectURL(state.export.url);
      state.export.url = null;
    }
    state.export.url = URL.createObjectURL(blob);
    els.downloadLink.href = state.export.url;
    els.downloadLink.download = name;
    els.exportResult.hidden = false;
    els.exportDone.textContent = "Corte renderizado";
    els.exportFileInfo.textContent = `${ext.toUpperCase()} · ${state.settings.ratio} · ${Math.round(duration)} s · ${fmtBytes(blob.size)}`;
    updateExportProgress(100, "Concluído.");
    els.exportStart.disabled = false;
    els.exportStart.textContent = "Renderizar novamente";
    els.exportCancel.textContent = "Fechar";
    state.exported = true;
    updateSteps();
    setBadge("Corte exportado", "is-ready");

    const link = document.createElement("a");
    link.href = state.export.url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    toast(`Corte exportado: ${ext.toUpperCase()} · ${fmtBytes(blob.size)}.`);
    playChime();
  }

  function cleanupExport() {
    if (state.export.video) {
      try { state.export.video.pause(); } catch (_) {}
      state.export.video.remove();
      state.export.video = null;
    }
    if (state.export.actx) {
      try { state.export.actx.close(); } catch (_) {}
      state.export.actx = null;
    }
    state.export.recorder = null;
  }

  function cancelExport() {
    if (!state.export.running) {
      closeOverlay(els.exportOverlay);
      return;
    }
    state.export.cancel = true;
    els.exportStatus.textContent = "Cancelando…";
    els.exportCancel.disabled = true;
  }

  async function startExport() {
    if (state.export.running) return;
    const clip = currentClip();
    if (!clip) {
      toast("Escolha um corte antes de exportar.", "error");
      return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      toast("Este navegador não consegue renderizar o clipe. Use Edge ou Chrome.", "error", 7000);
      return;
    }
    const sample = els.sampleExport.checked;
    const duration = sample ? Math.min(12, clip.length) : clip.length;
    if (duration < 0.5) {
      toast("Este corte é curto demais para renderizar.", "error");
      return;
    }
    const burn = els.burnCaptions.checked && !els.burnCaptions.disabled && clip.captionGroups.length > 0;
    const watermark = els.brandWatermarkToggle.checked && Boolean(state.settings.brand.trim());
    const [w, h] = RATIO_DIMS[state.settings.ratio] || RATIO_DIMS["9:16"];
    const mime = chooseExportMime();
    if (!mime) {
      toast("Nenhum formato de gravação está disponível neste navegador.", "error", 7000);
      return;
    }

    state.export.running = true;
    state.export.cancel = false;
    pausePreview();
    els.exportResult.hidden = true;
    els.exportProgress.hidden = false;
    els.exportStart.disabled = true;
    els.exportStart.textContent = "Renderizando…";
    els.exportCancel.disabled = false;
    els.exportCancel.textContent = "Cancelar";
    updateExportProgress(0, `Preparando ${sample ? "a amostra" : "o corte"}…`);

    let exportVideo = null;
    let actx = null;
    let recorder = null;
    let stream = null;
    try {
      await loadCanvasFonts();
      exportVideo = document.createElement("video");
      exportVideo.src = state.url;
      exportVideo.playsInline = true;
      exportVideo.preload = "auto";
      exportVideo.muted = true;
      exportVideo.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:.001;pointer-events:none";
      document.body.append(exportVideo);
      state.export.video = exportVideo;

      // Ativa o elemento dentro do gesto do usuário.
      try { await exportVideo.play(); } catch (_) {}
      exportVideo.pause();
      exportVideo.muted = false;
      await waitForMetadata(exportVideo, 20000);
      await resolveVideoDuration(exportVideo);
      await seekVideo(exportVideo, clip.start + 0.02, 9000);
      if (state.export.cancel) throw new Error("cancelled");

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      drawExportFrame(canvas, exportVideo, clip, 0, { captions: burn, watermark, style: state.settings.style });

      actx = new (window.AudioContext || window.webkitAudioContext)();
      await actx.resume();
      state.export.actx = actx;
      const source = actx.createMediaElementSource(exportVideo);
      const dest = actx.createMediaStreamDestination();
      source.connect(dest);

      const canvasStream = canvas.captureStream(30);
      stream = new MediaStream();
      canvasStream.getVideoTracks().forEach((track) => stream.addTrack(track));
      dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      if (!stream.getVideoTracks().length) throw new Error("no-video-track");

      const options = {
        mimeType: mime,
        videoBitsPerSecond: 7000000,
        audioBitsPerSecond: 128000,
      };
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (_) {
        recorder = new MediaRecorder(stream, { mimeType: mime });
      }
      state.export.recorder = recorder;
      const chunks = [];
      const stopped = new Promise((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
      });
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.start(250);

      try {
        await exportVideo.play();
      } catch (_) {
        throw new Error("play-blocked");
      }
      updateExportProgress(0, `Renderizando ${state.settings.ratio} · ${Math.round(duration)} s`);
      const startedAt = performance.now();
      let stoppedOnce = false;
      await new Promise((resolve) => {
        const stop = () => {
          if (stoppedOnce) return;
          stoppedOnce = true;
          try { exportVideo.pause(); } catch (_) {}
          if (recorder.state !== "inactive") {
            try { recorder.stop(); } catch (_) {}
          }
          resolve();
        };
        const tick = () => {
          if (state.export.cancel) {
            stop();
            return;
          }
          const elapsed = exportVideo.currentTime - (clip.start + 0.02);
          const local = clamp(elapsed, 0, duration);
          drawExportFrame(canvas, exportVideo, clip, local, { captions: burn, watermark, style: state.settings.style });
          updateExportProgress(
            (local / duration) * 100,
            `Renderizando ${state.settings.ratio} · ${fmtTime(local)} de ${fmtTime(duration)}`
          );
          if (
            elapsed >= duration - 0.035 ||
            exportVideo.ended ||
            performance.now() - startedAt > (duration + 35) * 1000
          ) {
            stop();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      await stopped;
      if (state.export.cancel) throw new Error("cancelled");
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error("empty-blob");
      finishExport(blob, mime, duration, clip, sample);
    } catch (error) {
      if (error && error.message === "cancelled") {
        updateExportProgress(0, "Renderização cancelada.");
        toast("Renderização cancelada. Nenhum arquivo foi baixado.");
      } else {
        console.error(error);
        els.exportStatus.textContent = "A renderização falhou.";
        toast("Não foi possível renderizar. Tente a amostra de 12 s ou outro navegador.", "error", 7000);
      }
      els.exportStart.disabled = false;
      els.exportStart.textContent = "Tentar novamente";
      els.exportCancel.disabled = false;
      els.exportCancel.textContent = "Fechar";
    } finally {
      state.export.running = false;
      state.export.cancel = false;
      if (stream) stream.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });
      cleanupExport();
    }
  }

  /* ============================================================
     INICIALIZAÇÃO E EVENTOS
     ============================================================ */

  function applySettingsUI() {
    const s = state.settings;
    els.lenRange.value = String(s.length);
    els.countRange.value = String(s.count);
    els.focusRange.value = String(s.focus);
    els.lenLabel.textContent = `${s.length} s`;
    els.countLabel.textContent = `${s.count} cortes`;
    els.langSelect.value = s.lang;
    if (els.settingsLang) els.settingsLang.value = s.lang;
    els.brandInput.value = s.brand;
    applyMotionSettings();
    applyTheme(s.theme, false);
    setRangeFill(els.lenRange);
    setRangeFill(els.countRange);
    setRangeFill(els.focusRange);
    setStyle(s.style, false);
    setRatio(s.ratio, false);
    updateFocusLabel();
    updateWatermark();
    updateAnalysisHint();
    updatePublishPanel();
    updateSteps();
    updateHeaderCta();
  }

  let coverBusy = false;
  let coverTitleTimer = 0;

  function bindEvents() {
    if (els.openingSkip) els.openingSkip.addEventListener("click", dismissOpening);

    document.querySelectorAll(".js-theme").forEach((button) => {
      button.addEventListener("click", toggleTheme);
    });
    document.querySelectorAll(".js-settings").forEach((button) => {
      button.addEventListener("click", () => openOverlay(els.settingsOverlay));
    });
    if (els.settingsClose) els.settingsClose.addEventListener("click", () => closeOverlay(els.settingsOverlay));
    if (els.settingsDone) els.settingsDone.addEventListener("click", () => closeOverlay(els.settingsOverlay));
    if (els.settingsOverlay) {
      els.settingsOverlay.addEventListener("click", (event) => {
        if (event.target === els.settingsOverlay) closeOverlay(els.settingsOverlay);
      });
    }
    if (els.themeChoice) {
      els.themeChoice.addEventListener("click", (event) => {
        const button = event.target.closest("[data-theme-choice]");
        if (!button) return;
        applyTheme(button.dataset.themeChoice, true);
        saveSettings();
      });
    }
    if (els.settingsReset) {
      els.settingsReset.addEventListener("click", () => {
        state.settings = { ...DEFAULT_SETTINGS };
        saveSettings();
        applySettingsUI();
        updateCaptionStatus();
        updatePublishPanel();
        updateSteps();
        updateHeaderCta();
        toast("Ajustes restaurados.");
      });
    }

    document.querySelectorAll(".js-pick").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        pickFile();
      });
    });

    els.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) loadFile(file);
      event.target.value = "";
    });

    els.openStudioBtn.addEventListener("click", () => {
      if (state.ready) showStudio(); else pickFile();
    });
    els.studioBack.addEventListener("click", showLanding);
    els.studioBrand.addEventListener("click", (event) => {
      event.preventDefault();
      showLanding();
    });
    els.newFilmBtn.addEventListener("click", pickFile);

    const drop = els.dropzone;
    drop.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      pickFile();
    });
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pickFile();
      }
    });
    ["dragenter", "dragover"].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.add("dragging");
      });
    });
    ["dragleave", "dragend"].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove("dragging");
      });
    });
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      drop.classList.remove("dragging");
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) loadFile(file);
    });
    document.addEventListener("dragover", (event) => event.preventDefault());
    document.addEventListener("drop", (event) => {
      if (!drop.contains(event.target)) event.preventDefault();
    });

    els.previewVideo.addEventListener("click", togglePlay);
    els.playBtn.addEventListener("click", togglePlay);
    els.previewVideo.addEventListener("play", () => {
      els.playBtn.classList.add("playing");
      startPlayerLoop();
    });
    els.previewVideo.addEventListener("pause", () => {
      els.playBtn.classList.remove("playing");
      updatePlayerUI();
      renderCaptions(els.previewVideo.currentTime);
    });
    els.previewVideo.addEventListener("timeupdate", () => {
      updatePlayerUI();
      renderCaptions(els.previewVideo.currentTime);
    });
    els.previewVideo.addEventListener("seeked", () => {
      updatePlayerUI();
      renderCaptions(els.previewVideo.currentTime);
    });
    els.previewVideo.addEventListener("ended", () => {
      els.playBtn.classList.remove("playing");
      renderCaptions(els.previewVideo.currentTime);
    });
    els.previewVideo.addEventListener("error", () => {
      toast("O vídeo encontrou um erro de reprodução.", "error");
    });

    els.seekRange.addEventListener("input", () => {
      seekPreview(Number(els.seekRange.value));
      setRangeFill(els.seekRange);
    });

    els.focusRange.addEventListener("input", () => {
      state.settings.focus = Number(els.focusRange.value);
      updateFocusLabel();
      saveSettings();
    });

    els.lenRange.addEventListener("input", () => {
      state.settings.length = Number(els.lenRange.value);
      els.lenLabel.textContent = `${state.settings.length} s`;
      setRangeFill(els.lenRange);
    });
    els.lenRange.addEventListener("change", () => {
      saveSettings();
      if (state.analysis.samples.length && !state.analysis.running) {
        deriveClips();
        toast("Cortes recalculados com a mesma leitura.");
      }
    });

    els.countRange.addEventListener("input", () => {
      state.settings.count = Number(els.countRange.value);
      els.countLabel.textContent = `${state.settings.count} cortes`;
      setRangeFill(els.countRange);
    });
    els.countRange.addEventListener("change", () => {
      saveSettings();
      if (state.analysis.samples.length && !state.analysis.running) {
        deriveClips();
        toast("Cortes recalculados com a mesma leitura.");
      }
    });

    els.ratioGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-ratio]");
      if (!button) return;
      setRatio(button.dataset.ratio);
    });

    els.styleGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-style]");
      if (!button) return;
      setStyle(button.dataset.style);
    });

    const setLanguage = (value) => {
      if (!["pt", "en", "es", "auto"].includes(value)) return;
      state.settings.lang = value;
      els.langSelect.value = value;
      if (els.settingsLang) els.settingsLang.value = value;
      saveSettings();
    };
    els.langSelect.addEventListener("change", () => setLanguage(els.langSelect.value));
    if (els.settingsLang) els.settingsLang.addEventListener("change", () => setLanguage(els.settingsLang.value));

    if (els.ambientToggle) {
      els.ambientToggle.addEventListener("change", () => {
        state.settings.ambient = els.ambientToggle.checked;
        applyMotionSettings();
        saveSettings();
      });
    }
    if (els.reducedMotionToggle) {
      els.reducedMotionToggle.addEventListener("change", () => {
        state.settings.reducedMotion = els.reducedMotionToggle.checked;
        applyMotionSettings();
        saveSettings();
      });
    }
    if (els.soundToggle) {
      els.soundToggle.addEventListener("change", () => {
        state.settings.sound = els.soundToggle.checked;
        saveSettings();
      });
    }

    els.brandInput.addEventListener("input", () => {
      state.settings.brand = els.brandInput.value.slice(0, 32);
      saveSettings();
      updateWatermark();
    });

    els.analyzeBtn.addEventListener("click", startAnalysis);
    els.analysisCancel.addEventListener("click", cancelAnalysis);
    els.analysisCancelBtn.addEventListener("click", cancelAnalysis);

    document.querySelectorAll(".console-tab").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.tab));
    });

    els.quickCaptionsBtn.addEventListener("click", () => {
      setTab("captions");
      if (window.innerWidth < 1120) els.tabCaptions.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.quickCoverBtn.addEventListener("click", openCover);

    els.importSrtBtn.addEventListener("click", () => {
      els.srtInput.value = "";
      els.srtInput.click();
    });
    els.srtInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) importSrtFile(file);
      event.target.value = "";
    });

    els.whisperBtn.addEventListener("click", openWhisper);
    els.whisperStart.addEventListener("click", runWhisper);
    els.whisperCancel.addEventListener("click", cancelWhisper);
    els.whisperClose.addEventListener("click", cancelWhisper);

    els.coverBtn.addEventListener("click", openCover);
    els.coverClose.addEventListener("click", () => closeOverlay(els.coverOverlay));
    els.coverDownload.addEventListener("click", downloadCover);
    els.coverPreset.addEventListener("change", () => renderCover());
    els.coverTitle.addEventListener("input", () => {
      clearTimeout(coverTitleTimer);
      coverTitleTimer = setTimeout(() => {
        if (!els.coverOverlay.hidden) renderCover();
      }, 150);
    });
    els.coverRandomBtn.addEventListener("click", async () => {
      const clip = currentClip();
      if (!clip || coverBusy) return;
      coverBusy = true;
      els.coverLoading.hidden = false;
      state.cover.token += 1;
      const token = state.cover.token;
      const time = clip.start + clip.length * (0.15 + Math.random() * 0.7);
      try {
        await grabCoverFrame(time, token);
        if (token === state.cover.token) renderCover();
      } catch (_) {
        toast("Não foi possível capturar outro quadro.", "error");
      } finally {
        coverBusy = false;
        els.coverLoading.hidden = true;
      }
    });

    els.kitBtn.addEventListener("click", openKit);
    els.kitClose.addEventListener("click", () => closeOverlay(els.kitOverlay));
    els.kitDownloadTxt.addEventListener("click", downloadKit);
    els.kitDownloadCover.addEventListener("click", () => {
      closeOverlay(els.kitOverlay);
      openCover();
    });
    els.kitExport.addEventListener("click", () => {
      closeOverlay(els.kitOverlay);
      openExport();
    });
    document.querySelectorAll(".js-copy").forEach((button) => {
      button.addEventListener("click", async () => {
        const target = document.getElementById(button.dataset.target);
        if (!target) return;
        const ok = await copyText(target.textContent || "");
        toast(ok ? "Copiado para a área de transferência." : "Não foi possível copiar. Selecione o texto manualmente.", ok ? "ok" : "error");
      });
    });

    els.exportBtn.addEventListener("click", openExport);
    els.exportStart.addEventListener("click", startExport);
    els.exportCancel.addEventListener("click", cancelExport);
    els.exportClose.addEventListener("click", cancelExport);
    els.sampleExport.addEventListener("change", updateExportTag);

    function onKeydown(event) {
      const activeOverlay = document.querySelector(".overlay:not([hidden])")
        || (els.opening && !els.opening.hidden && !els.opening.classList.contains("is-leaving") ? els.opening : null);
      if (event.key === "Tab" && activeOverlay) {
        const focusables = focusableIn(activeOverlay);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.key === "Escape") {
        if (!els.analysisOverlay.hidden) {
          if (state.analysis.running) cancelAnalysis(); else closeOverlay(els.analysisOverlay);
          return;
        }
        if (!els.whisperOverlay.hidden) {
          if (state.capture.running) cancelWhisper(); else closeOverlay(els.whisperOverlay);
          return;
        }
        if (!els.exportOverlay.hidden) {
          if (state.export.running) cancelExport(); else closeOverlay(els.exportOverlay);
          return;
        }
        if (!els.coverOverlay.hidden) {
          closeOverlay(els.coverOverlay);
          return;
        }
        if (!els.kitOverlay.hidden) {
          closeOverlay(els.kitOverlay);
          return;
        }
        if (!els.settingsOverlay.hidden) {
          closeOverlay(els.settingsOverlay);
        }
        return;
      }

      if (els.studioScreen.hidden) return;
      if (document.querySelector(".overlay:not([hidden])")) return;
      const target = event.target;
      if (target && target.closest("input, select, textarea, button, a, [contenteditable='true']")) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekPreview(els.previewVideo.currentTime - 5);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekPreview(els.previewVideo.currentTime + 5);
      }
    }
    document.addEventListener("keydown", onKeydown);

    THEME_MEDIA.addEventListener("change", () => {
      if (state.settings.theme === "auto") applyTheme("auto", false);
    });

    window.addEventListener("beforeunload", () => {
      pausePreview();
      if (state.export.url) {
        URL.revokeObjectURL(state.export.url);
        state.export.url = null;
      }
    });
  }

  function init() {
    loadSettings();
    applySettingsUI();
    bindEvents();
    els.samplerVideo.muted = true;
    setTab("scene");
    if (els.opening) {
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 350 : 1500;
      setTimeout(dismissOpening, delay);
    }
  }

  init();
})();
