/* ============================================================
   APOLLOCUT — motor único de legenda
   O mesmo código desenha na prévia (canvas do frame) e no vídeo
   exportado (canvas do MediaRecorder). Sem DOM, sem CSS.
   ============================================================ */

const FAMILIA = {
  ritual: '"Cinzel", "Cormorant Garamond", Georgia, serif',
  display: '"Cormorant Garamond", Georgia, serif',
  ui: '"Manrope", "Segoe UI", system-ui, sans-serif',
};

/**
 * Predefinições autorais. `size`, `y`, `marginX` e `pad` são frações da
 * altura/largura do quadro — a prévia e o export usam a mesma proporção.
 */
export const CAPTION_PRESETS = {
  ode: {
    label: 'Clássico',
    family: FAMILIA.ritual,
    weight: 500,
    size: 0.05,
    upper: true,
    letter: 0.04,
    color: '#f6e9c9',
    stroke: 'rgba(10, 8, 6, 0.9)',
    strokeWidth: 0.1,
    shadow: true,
    box: null,
    y: 0.8,
    lineHeight: 1.22,
    marginX: 0.07,
    maxLines: 2,
  },
  ditirambo: {
    label: 'Impacto',
    family: FAMILIA.ui,
    weight: 800,
    size: 0.055,
    upper: true,
    letter: 0.01,
    color: '#fff4e3',
    stroke: null,
    strokeWidth: 0,
    shadow: false,
    box: 'rgba(169, 84, 52, 0.92)',
    y: 0.78,
    lineHeight: 1.18,
    marginX: 0.08,
    maxLines: 2,
    pad: { x: 0.45, y: 0.2 },
  },
  estrofe: {
    label: 'Karaokê',
    family: FAMILIA.display,
    weight: 600,
    size: 0.055,
    upper: false,
    letter: 0.01,
    color: '#ffffff',
    stroke: 'rgba(0, 0, 0, 0.75)',
    strokeWidth: 0.1,
    shadow: true,
    box: null,
    y: 0.79,
    lineHeight: 1.2,
    marginX: 0.07,
    maxLines: 2,
    karaoke: true,
    activeColor: '#f2cf85',
  },
  marmore: {
    label: 'Mínimo',
    family: FAMILIA.ui,
    weight: 700,
    size: 0.042,
    upper: false,
    letter: 0.005,
    color: '#17130f',
    stroke: null,
    strokeWidth: 0,
    shadow: false,
    box: 'rgba(244, 238, 226, 0.94)',
    y: 0.82,
    lineHeight: 1.3,
    marginX: 0.09,
    maxLines: 2,
    pad: { x: 0.36, y: 0.18 },
  },
  helio: {
    label: 'Hélio',
    family: FAMILIA.ui,
    weight: 800,
    size: 0.048,
    upper: true,
    letter: 0.06,
    color: '#ffe9a8',
    stroke: 'rgba(38, 20, 0, 0.85)',
    strokeWidth: 0.12,
    shadow: true,
    box: null,
    glow: 'rgba(255, 196, 64, 0.5)',
    y: 0.76,
    lineHeight: 1.2,
    marginX: 0.07,
    maxLines: 2,
  },
};

export const PRESET_NAMES = Object.keys(CAPTION_PRESETS);

export function presetOf(name) {
  return CAPTION_PRESETS[name] || CAPTION_PRESETS.ode;
}

function fonte(preset, size) {
  return `${preset.weight} ${Math.round(size)}px ${preset.family}`;
}

/** Quebra por largura medida; junta o excesso na última linha permitida. */
export function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
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
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines - 1);
    keep.push(lines.slice(maxLines - 1).join(' '));
    return keep;
  }
  return lines;
}

export function linhasDe(cue, ctx, preset, maxWidth) {
  const texto = String(cue.text || '').replace(/\s+/g, ' ').trim();
  const prontas = Array.isArray(cue.lines)
    ? cue.lines.map((l) => (Array.isArray(l) ? l.map((w) => w.text ?? w).join(' ') : String(l)))
    : null;
  // As linhas da segmentação só valem enquanto o texto não foi editado.
  if (prontas?.length && prontas.join(' ').replace(/\s+/g, ' ').trim() === texto) {
    const usadas = prontas.slice(0, preset.maxLines);
    return preset.upper ? usadas.map((l) => l.toUpperCase()) : usadas;
  }
  return wrapText(ctx, preset.upper ? texto.toUpperCase() : texto, maxWidth, preset.maxLines);
}

export function aplicarTexto(ctx, preset, size, cor) {
  ctx.font = fonte(preset, size);
  ctx.fillStyle = cor || preset.color;
  ctx.strokeStyle = preset.stroke || 'transparent';
  ctx.lineWidth = preset.stroke ? Math.max(2, size * preset.strokeWidth) : 0;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
}

/** Desenha uma palavra com contorno/sombra, opcionalmente sobre uma caixa. */
function desenharPalavra(ctx, texto, x, y, preset, size, caixa) {
  if (caixa) {
    const largura = ctx.measureText(texto).width;
    const padX = size * (preset.pad?.x ?? 0.3);
    const padY = size * (preset.pad?.y ?? 0.18);
    const altura = size * 1.02 + padY * 2;
    const raio = Math.min(altura / 2, size * 0.18);
    ctx.save();
    ctx.fillStyle = caixa;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x - largura / 2 - padX, y - altura / 2, largura + padX * 2, altura, raio);
      ctx.fill();
    } else {
      ctx.fillRect(x - largura / 2 - padX, y - altura / 2, largura + padX * 2, altura);
    }
    ctx.restore();
  }
  if (preset.glow) {
    ctx.save();
    ctx.shadowColor = preset.glow;
    ctx.shadowBlur = size * 0.6;
  } else if (preset.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.28;
    ctx.shadowOffsetY = size * 0.05;
  }
  if (preset.stroke) ctx.strokeText(texto, x, y);
  ctx.fillText(texto, x, y);
  if (preset.glow || preset.shadow) ctx.restore();
}

function palavraAtiva(cue, time) {
  const words = cue?.words;
  if (!Array.isArray(words) || !words.length) return -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const inicio = Number(w.start);
    const fim = Number(w.end);
    if (Number.isFinite(inicio) && Number.isFinite(fim) && time >= inicio && time <= fim) return i;
  }
  return -1;
}

function cabe(ctx, lines, maxWidth) {
  return lines.every((l) => ctx.measureText(l).width <= maxWidth + 0.5);
}

/**
 * Ajusta tamanho até o texto caber em maxLines linhas dentro de maxWidth.
 * Garante desenho sem estouro mesmo se a segmentação prever linhas longas.
 */
function ajustarTamanho(ctx, cue, preset, maxWidth, sizeBase, height) {
  let size = sizeBase;
  let lines = [];
  const piso = height * 0.02;
  for (let i = 0; i < 12 && size > piso; i++) {
    aplicarTexto(ctx, preset, size, preset.color);
    lines = linhasDe(cue, ctx, preset, maxWidth);
    if (cabe(ctx, lines, maxWidth)) break;
    size *= 0.9;
  }
  return { size, lines };
}

/**
 * Desenha um bloco de legenda no contexto.
 * @returns {{lines: string[], height: number}|null}
 */
export function drawCaption(ctx, cue, options = {}) {
  const { width, height, preset: nome, time = 0, scale = 1, pos = null } = options;
  if (!ctx || !cue || !width || !height) return null;
  const preset = presetOf(nome);
  const sizeBase = height * preset.size * scale;
  const maxWidth = width * (1 - 2 * preset.marginX);
  const texto = String(cue.text || '').replace(/\s+/g, ' ').trim();
  if (!texto) return null;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const { size, lines } = ajustarTamanho(ctx, cue, preset, maxWidth, sizeBase, height);
  if (!lines.length) {
    ctx.restore();
    return null;
  }

  const lineHeight = size * preset.lineHeight;
  const centroY = height * (pos?.y ?? preset.y);
  const baseY = centroY - ((lines.length - 1) * lineHeight) / 2;
  const centroX = width * (pos?.x ?? 0.5);

  // Karaokê: desenha palavra por palavra para acender a que está sendo falada.
  if (preset.karaoke && Array.isArray(cue.words) && cue.words.length) {
    const ativa = palavraAtiva(cue, time);
    let indice = 0;
    const espaco = size * 0.28;
    lines.forEach((linha, i) => {
      const palavras = linha.split(' ');
      const larguras = palavras.map((p) => ctx.measureText(p).width);
      const total = larguras.reduce((a, b) => a + b, 0) + espaco * (palavras.length - 1);
      let x = centroX - total / 2;
      const y = baseY + i * lineHeight;
      palavras.forEach((palavra, j) => {
        const largura = larguras[j];
        const ehAtiva = indice === ativa;
        aplicarTexto(ctx, preset, size, ehAtiva ? preset.activeColor : preset.color);
        ctx.textAlign = 'center';
        desenharPalavra(ctx, palavra, x + largura / 2, y, preset, size, null);
        if (ehAtiva) {
          ctx.save();
          ctx.strokeStyle = preset.activeColor;
          ctx.lineWidth = Math.max(2, size * 0.06);
          ctx.beginPath();
          ctx.moveTo(x, y + size * 0.62);
          ctx.lineTo(x + largura, y + size * 0.62);
          ctx.stroke();
          ctx.restore();
        }
        x += largura + espaco;
        indice++;
      });
    });
    ctx.restore();
    return { lines, height: lines.length * lineHeight };
  }

  lines.forEach((linha, i) => {
    desenharPalavra(ctx, linha, centroX, baseY + i * lineHeight, preset, size, preset.box);
  });
  ctx.restore();
  return { lines, height: lines.length * lineHeight };
}

/** Marca a área segura do 9:16 (usada só na prévia, nunca no vídeo). */
export function drawSafeArea(ctx, width, height) {
  if (!ctx) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  ctx.strokeRect(width * 0.06, height * 0.07, width * 0.88, height * 0.86);
  ctx.restore();
}

/** Marca d'água opcional do app. */
export function drawWatermark(ctx, width, height, options = {}) {
  const { text = 'ApolloCut', color = 'rgba(255, 248, 233, 0.72)' } = options;
  if (!ctx || !width || !height) return;
  const size = Math.max(9, Math.round(height * 0.022));
  ctx.save();
  ctx.font = `600 ${size}px ${FAMILIA.ui}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height * 0.945);
  ctx.restore();
}

/** Garante que as fontes locais estão prontas antes de medir/desenhar. */
export async function carregarFontes() {
  if (typeof document === 'undefined' || !document.fonts) return;
  const familias = ['500 20px "Cinzel"', '600 20px "Cormorant Garamond"', '800 20px "Manrope"'];
  await Promise.all(familias.map((f) => document.fonts.load(f).catch(() => [])));
}
