/* ============================================================
   APOLLOCUT — catálogo de modelos de transcrição
   Os modelos `_timestamped` trazem `alignment_heads`, necessários
   para tempo por palavra. Todos rodam local, no navegador.
   ============================================================ */

export const MODELS = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};

export const DEFAULT_MODEL = MODELS.base;

export function pickModel(quality = 'auto', device = {}) {
  if (quality === 'fast') return MODELS.tiny;
  if (quality === 'precise') return MODELS.small;
  // "auto" = base: medido como melhor equilíbrio no navegador (WER baixo,
  // ~1/3 do tempo do small). O small fica para "mais preciso".
  const { memory = 8 } = device;
  if (memory <= 2) return MODELS.tiny;
  return MODELS.base;
}
