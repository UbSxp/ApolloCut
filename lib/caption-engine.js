/* ============================================================
   APOLLOCUT — Motor único de layout e tempo de legendas
   Compartilhado entre pré-visualização (DOM) e exportação (canvas ASS)
   Tipos: Palavra, BlocoDeLegenda, EstiloDeLegenda
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ApolloCaptionEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---- Configuração central de parâmetros de tempo (ms) ---- */
  const CFG = Object.freeze({
    // Duração mínima/máxima de bloco de legenda
    MIN_BLOCK_MS: 350,
    MAX_BLOCK_MS: 3500,

    // Palavra isolada (ênfase) pode ser mais curta
    MIN_WORD_ISOLATED_MS: 250,

    // Antecipação de entrada (bloco aparece cedo)
    LEAD_IN_MS: 60,

    // Pós-saída: folga após última palavra em silêncio longo
    TRAIL_OUT_LONG_PAUSE_MS: 150,

    // Ponte entre blocos consecutivos (lacuna < 120ms = junta)
    GAP_BRIDGE_MS: 120,

    // Limite para lacuna visível indevida
    MAX_VISIBLE_GAP_MS: 150,

    // Silêncio longo: legenda some (não fica parada)
    LONG_SILENCE_HIDE_MS: 600,

    // Limite de refinamento por energia
    ENERGY_ADJUST_MAX_MS: 150,
    MIN_WORD_DURATION_MS: 40,

    // Dimensões
    VISIBLE_WIDTH_RATIO: 0.88, // 88% da largura do vídeo é "zona segura"
  });

  /* ---- Estilo de legenda ---- */
  const DEFAULT_STYLE = Object.freeze({
    fontFamily: '"Cormorant Garamond", Georgia, serif',
    fontWeight: 600,
    fontStyle: "normal",
    fontSizeRatio: 0.095, // 9.5% da altura do vídeo
    fontSizeAuto: true,
    textCase: "normal", // "normal" | "upper" | "lower"
    textColor: "rgba(255,255,255,1)",
    activeColor: "rgba(255,215,0,1)", // dourado (palavra ativa)
    outlineColor: "rgba(0,0,0,0.85)",
    outlineWidth: 2.5,
    shadowColor: "rgba(0,0,0,0.5)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    backgroundPadding: 4,
    backgroundRadius: 6,
    backgroundMode: "block", // "block" | "pill" | "none"
    letterSpacing: 0.5,
    lineHeight: 1.1,
    align: "center",
    maxWidthRatio: 0.82,
    maxLines: 2,
    wordsPerBlock: 4,
    animation: "none", // "none" | "fade" | "pop" | "slide"
    animationIntensity: 1,
    animationDuration: 300,
    showPunctuation: true,
    censorProfanity: false,
    position: {
      // posição vertical (porcentagem da altura, 0-100)
      // "safe" = 20% do topo (fora do topo do vídeo)
      vertical: "safe",
      // posição horizontal (porcentagem da largura, 0-100)
      horizontal: 50,
      // preset: "top" | "center" | "subtitle" | "safe" | "custom"
      preset: "safe",
    },
  });

  /* ---- Tipos ---- */
  /**
   * @typedef {Object} Palavra
   * @property {string} text
   * @property {number} start - segundos (rebaseados para o início do corte)
   * @property {number} end
   */

  /**
   * @typedef {Object} BlocoDeLegenda
   * @property {number} start
   * @property {number} end
   * @property {Palavra[]} words
   * @property {Array<Array<Palavra>>} [lines] - linhas já quebradas
   */

  /**
   * @typedef {typeof DEFAULT_STYLE} EstiloDeLegenda
   */

  /* ---- Busca binária ---- */
  function binarySearchActive(groups, time) {
    if (!groups || !groups.length) return -1;
    let lo = 0;
    let hi = groups.length - 1;

    // Se a palavra ativa está fora do intervalo atual, retorna -1
    if (time < groups[lo].start || time > groups[hi].end) return -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const g = groups[mid];
      if (time >= g.start && time <= g.end) return mid;
      if (time < g.start) hi = mid - 1;
      else lo = mid + 1;
    }
    return -1;
  }

  function binarySearchWord(words, time) {
    if (!words || !words.length) return -1;
    let lo = 0;
    let hi = words.length - 1;
    if (time < words[lo].start || time > words[hi].end) return -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const w = words[mid];
      if (time >= w.start && time <= w.end) return mid;
      if (time < w.start) hi = mid - 1;
      else lo = mid + 1;
    }
    return -1;
  }

  /* ---- Pipeline de tempos ---- */

  /**
   * Ajusta tempos de palavras usando energia de voz (quando disponível).
   * Move início/fim para vales de energia próximos dentro de ±150ms.
   * Fallback: distribui proporcionalmente.
   * @param {Palavra[]} words - palavras com tempos brutos
   * @param {Float32Array} [samples] - amostras PCM normalizadas (0-1)
   * @param {number} [sampleRate]
   * @returns {Palavra[]}
   */
  function refineTimes(words, samples, sampleRate) {
    if (!words || !words.length) return [];
    if (!samples || !sampleRate) {
      // Fallback: distribuição proporcional por peso de caracteres
      return proportionalDistribute(words);
    }

    const refined = words.map((w, i) => {
      const result = { ...w };

      // Encontrar vales de energia ao redor de word.start e word.end
      const startIdx = Math.floor(w.start * sampleRate);
      const endIdx = Math.floor(w.end * sampleRate);

      if (startIdx >= 0 && startIdx < samples.length) {
        const adj = findEnergyValley(samples, startIdx, CFG.ENERGY_ADJUST_MAX_MS, sampleRate);
        if (adj !== null) result.start = Math.max(w.start - CFG.ENERGY_ADJUST_MAX_MS / 1000, adj / sampleRate);
      }
      if (endIdx >= 0 && endIdx < samples.length) {
        const adj = findEnergyValley(samples, endIdx, CFG.ENERGY_ADJUST_MAX_MS, sampleRate, true);
        if (adj !== null) result.end = Math.min(w.end + CFG.ENERGY_ADJUST_MAX_MS / 1000, adj / sampleRate);
      }

      // Garantir duração mínima
      const minDur = CFG.MIN_WORD_DURATION_MS / 1000;
      if (result.end - result.start < minDur) {
        result.end = result.start + minDur;
      }

      return result;
    });

    // Corrigir sobreposições (uma palavra não pode começar antes da anterior terminar)
    for (let i = 1; i < refined.length; i++) {
      if (refined[i].start < refined[i - 1].end) {
        refined[i].start = refined[i - 1].end;
      }
    }

    return refined;
  }

  /**
   * Encontra o vale de energia mais próximo de um índice, dentro de uma janela.
   * @param {Float32Array} samples
   * @param {number} centerIdx
   * @param {number} windowMs
   * @param {number} sampleRate
   * @param {boolean} [searchAfter] - se true, procura após; senão, antes
   */
  function findEnergyValley(samples, centerIdx, windowMs, sampleRate, searchAfter) {
    const windowSamples = Math.floor((windowMs / 1000) * sampleRate);
    const lo = Math.max(0, centerIdx - windowSamples);
    const hi = Math.min(samples.length - 1, centerIdx + windowSamples);
    const dir = searchAfter ? 1 : -1;

    // Procura o mínimo de energia na direção especificada
    let bestIdx = centerIdx;
    let bestEnergy = samples[centerIdx] || 0;
    for (let i = centerIdx + dir; dir > 0 ? i <= hi && i < centerIdx + windowSamples : i >= lo && i > centerIdx - windowSamples; i += dir) {
      const e = samples[i] || 0;
      if (e < bestEnergy) {
        bestEnergy = e;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  /**
   * Distribuição proporcional fallback (por peso de caracteres)
   */
  function proportionalDistribute(words) {
    if (!words.length) return [];
    const weights = words.map(w => Math.max(1, (w.text.replace(/[^\p{L}\p{N}]/gu, "") || "x").length));
    const total = weights.reduce((s, v) => s + v, 0) || 1;
    const from = words[0].start;
    const to = words[words.length - 1].end;
    const duration = to - from;
    let acc = 0;
    return words.map((w, i) => {
      const begin = from + (acc / total) * duration;
      acc += weights[i];
      const finish = from + (acc / total) * duration;
      return { ...w, start: begin, end: finish };
    });
  }

  /* ---- Agrupamento por sentido ---- */

  /**
   * Agrupa palavras em blocos de legenda por unidade de sentido.
   * Usa pausa > 300ms como separador de frase.
   * @param {Palavra[]} words
   * @param {Object} [options]
   * @returns {BlocoDeLegenda[]}
   */
  function agruparPorSentido(words, options) {
    const opt = options || {};
    const maxWords = opt.maxWords || CFG.wordsPerBlock;
    const maxChars = opt.maxChars || 42;
    const maxGap = opt.maxGap != null ? opt.maxGap : 0.3; // 300ms
    const maxDuration = opt.maxDuration || 7.0;

    if (!words || !words.length) return [];

    const blocks = [];
    let current = [];

    for (const raw of words) {
      const word = {
        text: String(raw.text || "").trim(),
        start: Number(raw.start),
        end: Number(raw.end),
      };
      if (!word.text || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;

      if (current.length) {
        const last = current[current.length - 1];
        const gap = word.start - last.end;
        const dur = word.end - current[0].start;
        const totalChars = current.reduce((sum, w) => sum + w.text.length + 1, 0) + word.text.length;

        if (gap > maxGap || dur > maxDuration || current.length >= maxWords) {
          if (current.length) blocks.push(fecharBloco(current));
          current = [word];
        } else if (totalChars > maxChars && current.length >= 3) {
          blocks.push(fecharBloco(current));
          current = [word];
        } else {
          current.push(word);
        }
      } else {
        current = [word];
      }
    }

    if (current.length) blocks.push(fecharBloco(current));

    // Pós-processamento: juntar blocos muito curtos com o anterior
    const merged = [];
    for (const block of blocks) {
      if (merged.length) {
        const prev = merged[merged.length - 1];
        const gap = block.start - prev.end;
        if (block.words.length <= 1 && gap < 0.15) {
          prev.words.push(...block.words);
          prev.end = block.end;
          continue;
        }
      }
      merged.push(block);
    }

    return merged.map(b => applyTimingRules(b));
  }

  function fecharBloco(words) {
    return {
      start: words[0].start,
      end: words[words.length - 1].end,
      words: words.map(w => ({ ...w })),
    };
  }

  /* ---- Regras de timing ---- */

  /**
   * Aplica regras de H4 (ponte de lacunas) e H5 (limpeza de timing).
   */
  function applyTimingRules(block) {
    const leadIn = CFG.LEAD_IN_MS / 1000;
    const result = { ...block };

    // Antecipação
    result.start = Math.max(0, result.start - leadIn);

    return result;
  }

  /**
   * Pós-processa blocos: ajusta pontes de lacuna, duração mínima/máxima.
   * @param {BlocoDeLegenda[]} blocks
   * @returns {BlocoDeLegenda[]}
   */
  function applyGapBridges(blocks) {
    if (!blocks || !blocks.length) return [];

    const result = blocks.map(b => ({
      start: b.start,
      end: b.end,
      words: b.words ? b.words.map(w => ({ ...w })) : [],
    }));

    for (let i = 0; i < result.length; i++) {
      const b = result[i];
      const dur = b.end - b.start;

      // Juntar blocos consecutivos se a lacuna for < 120ms
      if (i < result.length - 1) {
        const next = result[i + 1];
        const gap = next.start - b.end;
        if (gap > 0 && gap < CFG.GAP_BRIDGE_MS / 1000) {
          // Funde: o bloco atual termina quando o próximo começa + leadIn
          b.end = next.start;
        }
      }

      // Duração mínima
      if (b.end - b.start < CFG.MIN_BLOCK_MS / 1000) {
        b.end = b.start + CFG.MIN_BLOCK_MS / 1000;
      }

      // Duração máxima: corta se exceder
      if (b.end - b.start > CFG.MAX_BLOCK_MS / 1000) {
        b.end = b.start + CFG.MAX_BLOCK_MS / 1000;
      }
    }

    return result;
  }

  /* ---- Layout (quebra de linhas) ---- */

  /**
   * Segmenta palavras em linhas usando DP (usa lib/segmentador.js se disponível).
   * @param {Palavra[]} words
   * @param {number} maxChars - caracteres por linha (~21 para vertical)
   * @param {number} maxLines
   * @returns {Array<Array<Palavra>>}
   */
  function segmentarLinhas(words, maxChars, maxLines) {
    if (typeof window !== "undefined" && window.ApolloSegmentador) {
      const seg = window.ApolloSegmentador;
      const bloco = { words: words.map(w => ({ ...w })) };
      const result = seg.quebrarBloco(bloco, maxChars, maxLines || 2);
      return result.linhas;
    }

    // Fallback: quebra simples por limite de caracteres
    const lines = [];
    let current = [];
    let chars = 0;
    for (const w of words) {
      if (chars + w.text.length > maxChars && current.length) {
        lines.push(current);
        current = [];
        chars = 0;
      }
      current.push(w);
      chars += w.text.length + 1;
    }
    if (current.length) lines.push(current);
    return lines.length ? lines : [[]];
  }

  /* ---- Layout para pré-visualização (DOM) ---- */

  /**
   * Layouta um bloco: quebra em linhas e aplica o estilo.
   * @param {BlocoDeLegiona} block
   * @param {EstiloDeLegenda} style
   * @param {Object} dims - {width, height} resolução do canvas/vídeo
   * @returns {{lines: Array<Array<Palavra>>, style: Object, fontSize: number, posX: number, posY: number}}
   */
  function layoutBlock(block, style, dims) {
    const s = { ...DEFAULT_STYLE, ...style };
    const { width, height } = dims;
    const maxChars = Math.floor(width / (s.fontSizeRatio * height) / 0.45); // aproximado
    const maxLines = s.maxLines || 2;

    const words = block.words || [];
    const lines = segmentarLinhas(words, maxChars, maxLines);

    // Calcular fontSize
    let fontSize;
    if (s.fontSizeAuto) {
      fontSize = alturaAutomática(lines, width, height, s);
    } else {
      fontSize = s.fontSizeRatio * height;
    }

    // Posição vertical
    let posY;
    if (typeof s.position.vertical === "number") {
      posY = (s.position.vertical / 100) * height;
    } else {
      // Preset "safe": 14% da altura a partir do topo
      posY = height * 0.82; // terço inferior
    }

    const posX = typeof s.position.horizontal === "number"
      ? (s.position.horizontal / 100) * width
      : width / 2;

    return {
      lines,
      style: s,
      fontSize: Math.round(fontSize),
      posX,
      posY,
      width,
      height,
    };
  }

  function alturaAutomática(lines, width, height, style) {
    const targetChars = Math.floor(width / (style.fontSizeRatio * height) / 0.45);
    const maxCharsPerLine = targetChars || 21;
    const longestLine = Math.max(...lines.map(l => l.reduce((s, w) => s + w.text.length + 1, 0) - 1), 1);
    const ratio = Math.min(1, longestLine / maxCharsPerLine);
    // Ajusta para caber em 2 linhas
    const autoRatio = style.fontSizeRatio * (1 - Math.max(0, ratio - 0.8) * 0.3);
    return Math.max(style.fontSizeRatio * 0.6, autoRatio) * height;
  }

  /* ---- Renderização DOM (pré-visualização) ---- */

  function renderDOM(block, layout, container) {
    container.replaceChildren();
    container.classList.add("has-caption");

    const { lines, style, fontSize, posX, posY } = layout;

    lines.forEach((lineWords, lineIdx) => {
      const lineEl = document.createElement("div");
      lineEl.className = `cap-line cap-line-${lineIdx + 1}`;
      lineEl.style.setProperty("--cap-font-size", `${fontSize}px`);
      lineEl.style.setProperty("--cap-font-weight", style.fontWeight);
      lineEl.style.setProperty("--cap-font-style", style.fontStyle);
      lineEl.style.setProperty("--cap-text-color", style.textColor);
      lineEl.style.setProperty("--cap-active-color", style.activeColor);
      lineEl.style.setProperty("--cap-outline-color", style.outlineColor);
      lineEl.style.setProperty("--cap-outline-width", `${style.outlineWidth}px`);
      lineEl.style.setProperty("--cap-shadow-color", style.shadowColor);
      lineEl.style.setProperty("--cap-shadow-blur", `${style.shadowBlur}px`);
      lineEl.style.setProperty("--cap-letter-spacing", `${style.letterSpacing}px`);
      lineEl.style.setProperty("--cap-line-height", style.lineHeight);
      lineEl.style.setProperty("--cap-text-case", style.textCase);
      lineEl.style.setProperty("--cap-align", style.align);

      lineWords.forEach((word, wordIdx) => {
        const span = document.createElement("span");
        span.className = "cap-word";
        span.textContent = word.text;
        span.dataset.wordIndex = wordIdx;
        span.dataset.wordStart = word.start;
        span.dataset.wordEnd = word.end;
        span.style.fontFamily = style.fontFamily;
        lineEl.appendChild(span);
      });
      container.appendChild(lineEl);
    });

    // Posicionar o container
    container.style.left = `${posX}px`;
    container.style.top = `${posY}px`;
    container.style.transform = "translateX(-50%)";
  }

  /* ---- Aplicação de estilo a bloco individual ---- */

  /**
   * Aplica um estilo a um bloco específico (sobrescrita por bloco).
   */
  function applyBlockStyle(block, styleOverride) {
    if (!styleOverride || Object.keys(styleOverride).length === 0) return block;
    return {
      ...block,
      styleOverride: { ...styleOverride },
    };
  }

  /* ---- Exportação ASS ---- */

  /**
   * Gera o conteúdo ASS com o estilo e blocos aplicados.
   * @param {BlocoDeLegenda[]} blocks
   * @param {EstiloDeLegenda} style
   * @param {Object} dims - {width, height} resolução de saída
   * @param {number} [timelineOffset] - ajuste global em segundos
   * @returns {string} conteúdo ASS
   */
  function exportASS(blocks, style, dims, timelineOffset) {
    const s = { ...DEFAULT_STYLE, ...style };
    const { width: w, height: h } = dims;
    const offset = Number(timelineOffset) || 0;

    // Formata timestamp ASS: H:MM:SS.cc
    const fmtTs = (s) => {
      const total = Math.max(0, s + offset);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      const cs = Math.floor((sec % 1) * 100);
      return `${h}:${String(m).padStart(2, "0")}:${String(Math.floor(sec)).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    };

    // Escapa caracteres ASS: {}, \, _, *
    const escapeASS = (text) => String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/_/g, "\\_")
      .replace(/\*/g, "\\*");

    // Formata texto com tags de estilo (ASS)
    const formatWordText = (wordText, isActive, style) => {
      let text = escapeASS(wordText);
      if (!style.showPunctuation) {
        text = text.replace(/[.,;:!?]+$/, "");
      }
      return text;
    };

    const lines = [];

    // Cabeçalho
    lines.push("[Script Info]");
    lines.push("ScriptType: v4.00+");
    lines.push("ScaledBorderAndShadow: yes");
    lines.push(`PlayResX: ${w}`);
    lines.push(`PlayResY: ${h}`);
    lines.push("Timer: 100.0000");
    lines.push("");

    // Estilos
    lines.push("[V4+ Styles]");
    lines.push("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding");

    const assFont = s.fontFamily.replace(/"/g, "");
    const fontSize = Math.round(s.fontSizeRatio * h);
    const primary = rgbToASS(s.textColor);
    const secondary = rgbToASS(s.activeColor);
    const outline = rgbToASS(s.outlineColor);
    const back = rgbToASS(s.backgroundColor);
    const bold = s.fontWeight >= 600 ? -1 : 0;
    const italic = s.fontStyle === "italic" ? -1 : 0;
    const alignment = styleAlignToASS(s.align);

    lines.push(`Style: ApolloCut,${assFont},${fontSize},${primary},${secondary},${outline},${back},${bold},${italic},0,0,100,100,${s.letterSpacing},0,1,${Math.round(s.outlineWidth)},0,${alignment},0,0,100,1`);

    lines.push("");

    // Diálogo
    lines.push("[Events]");
    lines.push("Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

    for (const block of blocks) {
      const start = fmtTs(block.start);
      const end = fmtTs(block.end);
      const words = block.words || [];
      if (!words.length) continue;

      // Quebra em linhas
      const maxChars = 42;
      const lineArr = segmentarLinhas(words, maxChars, s.maxLines);

      const lineTexts = lineArr.map(lw => lw.map(w => formatWordText(w.text, false, s)).join(" ")).filter(Boolean);

      // Posição vertical ASS
      const vPos = posicaoVerticalToASS(s.position, h);

      // Se tiver animação, adiciona efeitos
      const effect = s.animation === "none" ? "" : assAnimationEffect(s);

      for (const lineText of lineTexts) {
        lines.push(`0,${start},${end},ApolloCut,,0,0,${vPos},${effect},${lineText}`);
      }
    }

    return lines.join("\n") + "\n";
  }

  function rgbToASS(rgbaStr) {
    const m = String(rgbaStr).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return "&H00FFFFFF&";
    const r = parseInt(m[1]).toString(16).padStart(2, "0");
    const g = parseInt(m[2]).toString(16).padStart(2, "0");
    const b = parseInt(m[3]).toString(16).padStart(2, "0");
    // ASS: &HBBGGRR&
    return `&H${b}${g}${r}&`;
  }

  function styleAlignToASS(align) {
    switch (align) {
      case "left": return 1;   // Bottom-Left
      case "right": return 3;   // Bottom-Right
      case "center": return 2;  // Bottom-Center
      default: return 2;
    }
  }

  function posicaoVerticalToASS(pos, height) {
    if (typeof pos.vertical === "number") {
      return Math.round((pos.vertical / 100) * height);
    }
    // "safe": terço inferior
    return Math.round(height * 0.82);
  }

  function assAnimationEffect(style) {
    // ASS não suporta animações complexas nativamente, mas pode usar \fad()
    if (style.animation === "fade") {
      return `fx`;
    }
    return "";
  }

  /* ---- Renderização Canvas ---- */

  /**
   * Desenha legendas no canvas (para exportação sem ASS).
   * Compartilha lógica de layout com o preview DOM.
   */
  function renderCanvas(blocks, style, canvas, currentTime, clipStart) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const s = { ...DEFAULT_STYLE, ...style };
    const localTime = currentTime - clipStart;

    // Encontra bloco ativo via busca binária
    const activeIdx = binarySearchActive(blocks, localTime);
    if (activeIdx < 0) return;

    const block = blocks[activeIdx];
    const layout = layoutBlock(block, s, { width: w, height: h });

    ctx.save();

    // Posição
    ctx.textAlign = s.align;
    ctx.textBaseline = "bottom";
    ctx.font = `${s.fontWeight} ${layout.fontSize}px ${s.fontFamily.replace(/"/g, "")}`;
    ctx.letterSpacing = `${s.letterSpacing}px`;
    ctx.fillStyle = s.textColor;
    ctx.shadowColor = s.shadowColor;
    ctx.shadowBlur = s.shadowBlur;
    ctx.shadowOffsetX = s.shadowOffsetX;
    ctx.shadowOffsetY = s.shadowOffsetY;

    // Outline
    if (s.outlineWidth > 0) {
      ctx.strokeWidth = s.outlineWidth;
      ctx.strokeStyle = s.outlineColor;
      ctx.lineJoin = "round";
    }

    const lineHeight = layout.fontSize * s.lineHeight;
    const yBase = layout.posY;

    layout.lines.forEach((lineWords, i) => {
      const y = yBase - (layout.lines.length - 1 - i) * lineHeight;
      const text = lineWords.map(w => w.text).join(" ");

      if (s.backgroundMode !== "none") {
        const metrics = ctx.measureText(text);
        const boxW = metrics.width;
        const boxH = layout.fontSize * 1.2;
        const pad = s.backgroundPadding;

        ctx.fillStyle = s.backgroundColor;
        ctx.fillRect(layout.posX - boxW / 2 - pad, y - boxH - pad, boxW + pad * 2, boxH + pad * 2);
        ctx.fillStyle = s.textColor; // restaura
      }

      if (s.outlineWidth > 0) {
        ctx.strokeText(text, layout.posX, y);
      }
      ctx.fillText(text, layout.posX, y);

      // Highlight palavra ativa
      const wordIdx = binarySearchWord(lineWords, localTime);
      if (wordIdx >= 0) {
        const before = lineWords.slice(0, wordIdx).map(w => w.text).join(" ");
        const activeText = lineWords[wordIdx].text;
        const beforeMetrics = ctx.measureText(before ? before + " " : "");

        ctx.fillStyle = s.activeColor;
        ctx.fillText(activeText, layout.posX + beforeMetrics.width, y); // simplificado
      }
    });

    ctx.restore();
  }

  return {
    CFG,
    DEFAULT_STYLE,
    binarySearchActive,
    binarySearchWord,
    refineTimes,
    agruparPorSentido,
    applyGapBridges,
    layoutBlock,
    renderDOM,
    exportASS,
    renderCanvas,
    applyBlockStyle,
    segmentarLinhas,
  };
});
