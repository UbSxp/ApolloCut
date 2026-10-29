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

export function pickModel(quality = 'auto', device = {}, seconds = 0) {
  if (quality === 'fast') return MODELS.tiny;
  if (quality === 'precise') return MODELS.small;
  const { memory = 8 } = device;
  if (memory <= 2) return MODELS.tiny;
  // "auto": em corte curto o small erra muito menos (medição no áudio real do
  // usuário: base perdia 20 s de fala). Até 90 s o custo (~30 s de CPU) cabe;
  // acima disso fica o base para não travar a máquina.
  if (seconds > 0 && seconds <= 90) return MODELS.small;
  return MODELS.base;
}
