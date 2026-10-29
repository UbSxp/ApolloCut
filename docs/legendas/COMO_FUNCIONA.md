# Como funcionam as legendas no ApolloCut

Visão técnica do pipeline de legendas — do áudio ao SRT/VTT/ASS, passando pelo Whisper, alinhamento forçado, segmentação, motor de render e exportação.

---

## 1. Entrada de áudio

- O corte selecionado tem seu áudio extraído via `AudioWorklet` (mono, 16 kHz) direto do `<video>` — sem `MediaRecorder`, sem recodificação Opus.
- O stream de áudio vai para o Whisper via `transformers.js` (ONNX, WASM/q8).

---

## 2. Transcrição (Whisper)

Modelos suportados (escolhidos por modo):

| Modo | Modelo | Uso |
|------|--------|-----|
| `fast` | `whisper-tiny_timestamped` | Rápido, menor qualidade |
| `auto` (padrão) | `whisper-base_timestamped` | Equilibrado |
| `precise` | `whisper-small_timestamped` | Mais lento, melhor em ruído |

- `return_timestamps: 'word'` → o modelo devolve início/fim **por palavra**.
- `chunk_length_s: 30`, `stride_length_s: 5` → contexto longo, menos erros de borda.
- O áudio do corte inteiro é transcrito de uma vez (não por segmento) → coerência de vocabulário.

---

## 3. Pós-processamento de texto (pt-BR)

Arquivo: `src/captions/words.js`

1. **Limpeza**: remove tokens de silêncio (`<|...|>`), normaliza espaços.
2. **Anti-alucinação**:
   - `trimSilence`: descarta palavras em regiões de áudio mudo (VAD do navegador).
   - Remove "frases fantasma" nas pontas (repete último token).
   - Corta laços de repetição (ex.: "a a a a").
3. **Vocabulário autoral** (`hardWordsInput`):
   - Correção por esqueleto consonantal (`skeleton()`): `pç` → `peixe`, `kct` → `ketchup`.
   - Termos compostos exigem ambas as partes com esqueleto igual.
   - Siglas (≤2 letras) exigem igualdade exata.
4. **Monotonic**: ordena por `start`, corta `end` no `start` da seguinte, piso 60 ms/palavra.
5. **Números por extenso**: `1.20` → `um real e vinte centavos`, `R$ 1,20` → `R$ 1,20`.

---

## 4. Alinhamento forçado a regiões de fala

Arquivo: `src/captions/vad.js`

- `speechRegions(audio, { minGap: 0.4 })` → regiões de voz no áudio decodificado (não no wav original).
- `alignWordsToSpeech(words, regions, { tail: 0.3, tailGap: 0.6, minGap: 0.4, minShift: 0.2, maxShift: 3 })`:
  - Só move palavra que cai em silêncio **ou** na cauda (≤ 0,3 s) de região seguida de pausa > 0,6 s.
  - Deslocamento ≥ 0,2 s, no máximo 3 s.
  - **Nunca** além do `start` da palavra seguinte (evita inversão "certo, Eu né?").
- `leadMs` (desconto fixo de latência) **não usado** — medição mostrou que piora (77 → 148 ms).

---

## 5. Segmentação em blocos de legenda

Arquivo: `src/captions/segment.js`

Preset `curto` (padrão):

- Máx 2 linhas, 32–42 caracteres/linha.
- Pausa > 350 ms encerra bloco.
- Não deixa bloco de 1 palavra no meio da fala.
- Linhas equilibradas: menor ≥ metade da maior.
- Quebra por sentido: não separa artigo do substantivo, não quebra número por extenso.
- Tempos dos blocos contínuos e crescentes.

---

## 6. Motor único de render (canvas)

Arquivo: `src/captions/render.js`

- **Uma função** `drawCaption(ctx, cue, options)` desenha na prévia **e** no vídeo exportado.
- 5 presets (estética grega, área segura 9:16):

| Chave (`data-style`) | Rótulo | Fonte | Cor | Efeito |
|----------------------|--------|-------|-----|--------|
| `ode` | Clássico | Cinzel (serifada) | Dourado | Caixa alta, sombra |
| `ditirambo` | Impacto | Manrope (bold) | Terracota | Bloco, uppercase |
| `estrofe` | Karaokê | Cormorant Garamond | Mármore | Palavra ativa acende |
| `marmore` | Mínimo | Manrope (800) | Bege/Preto | Limpo, contido |
| `helio` | Hélio | Manrope (800) | Gradiente quente | Sol/brilho |

- **Auto-fit**: se o texto não couber na largura (`marginX`), itera reduzindo fonte até 2% da altura.
- **Karaokê** (`estrofe`): desenha palavra por palavra, sublinha a ativa.
- **Acessibilidade**: `.frame-captions` vira `sr-only` com `role="status" aria-live="polite"` — leitores de tela leem o texto.

---

## 7. Controles na prévia

Arquivo: `src/ui/captions.js` → `setupCaptionDrag()`

- **Arraste** do bloco → salva `settings.captionPos {x, y}` (0–1 relativo ao frame).
- **Alça** no canto inferior-direito → escala `settings.captionScale` (0.5–2.5).
- **Área segura** (`.safe-area`) acende durante a interação.
- Persistência em `localStorage` (`apollocut.settings.v2`).

---

## 8. Editor de blocos (lista)

- Início/fim/texto editáveis; `afterCuesChanged()` reordena e redesenha.
- **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z): histórico JSON no `StateManager` (`snapshotCues`).
- **Dividir** (Enter): divide palavras proporcionalmente ao tempo do cursor.
- **Juntar** (Shift+Backspace): funde com o próximo.
- **Nudge** (↑/↓): ajusta início/fim ±0,1 s respeitando vizinhos.
- **Seek** (←/→): move o player ±0,5 s.
- **Localizar/Substituir**: highlight visual no textarea, substituição case-insensitive.

---

## 9. Exportação de legendas

Arquivo: `src/ui/captions.js` → `exportSubtitles(format)`

| Formato | Extensão | Uso |
|---------|----------|-----|
| SRT | `.srt` | Padrão universal |
| VTT | `.vtt` | Web nativo (`<track>`) |
| ASS | `.ass` | Estilos avançados (karaokê, posicionamento) |

---

## 10. Exportação de vídeo (queima de legendas)

Arquivo: `src/ui/export.js`

- `canvas.captureStream(30)` + `MediaRecorder` (MP4/H.264 → WebM/VP9/VP8).
- **Motor único**: mesmo `drawCaption` da prévia.
- Opções no modal:
  - **Queimar legendas** (padrão): desenha vídeo + legendas + marca d'água.
  - **Só legendas** (`onlyCaptions`): canvas `alpha: true`, WebM/VP9, sem áudio, fundo transparente — para sobrepor em outro editor.
  - **Amostra 12 s**: render rápido para conferir.
  - **Assinatura**: `drawWatermark` com `brand` do usuário.

---

## 11. Métricas de qualidade (medir.mjs)

Arquivo: `tests/legendas/medir.mjs`

Roda o app real no Playwright (Chromium) em 12 clipes TTS pt-BR com referência por palavra.

| Métrica | Meta | Atual (rodada 08) |
|---------|------|-------------------|
| WER global | ≤ 10% | **4,3%** |
| CER global | ≤ 5% | **1,2%** |
| Erro médio tempo | < 100 ms | **77 ms** |
| p95 tempo | < 200 ms | **199 ms** |
| Alucinações | = 0 | **0** |
| Perdidas máx/clip | ≤ 5 | **2** |

- `npm run medir` → roda medição completa.
- `npm run testes` → 22 testes unitários (texto + segmentação).
- `npm run auditoria` → E2E + `auditar.mjs` (falha se piorar).

---

## 12. Arquivos-chave

```
src/captions/
  index.js          # parseSubtitles (SRT/VTT), segmentWords, exportSubtitles
  normalize.js      # normalizeForCompare/CER, numToWords, applyVocabulary
  words.js          # cleanWords, monotonic, applyVocabulary, skeleton, termMatches
  vad.js            # trimSilence, speechRegions, alignWordsToSpeech
  segment.js        # segmentWords, layoutLines, displayLines
  render.js         # CAPTION_PRESETS, drawCaption, drawWatermark, carregarFontes, auto-fit
  models.js         # carregarModelo, transcreverComWhisper

src/ui/
  captions.js       # CaptionController: editor, drag, shortcuts, export SRT/VTT/ASS
  export.js         # ExportController: canvas + MediaRecorder, onlyCaptions
  state.js          # StateManager: snapshotCues/undoCues/redoCues

tests/legendas/
  medir.mjs         # Harness Playwright + métricas
  auditar.mjs       # Valida thresholds (roda no npm run auditoria)
  capturas.mjs      # Gera PNGs dos 5 estilos × 2 temas
  texto.test.mjs    # 13 testes de normalização/segmentação/vocab
  segmentacao.test.mjs # 9 testes de layout/quebra
  clipes/           # 12 .mp4 + .json referência por palavra
```

---

## 13. Como rodar

```bash
# Instala dependências (Playwright, transformers, etc.)
npm install

# Gera clipes de teste (TTS pt-BR) — requer Windows/Edge TTS
npm run clipes

# Roda testes unitários
npm run testes

# Mede qualidade completa (abre Chromium, leva ~3 min)
npm run medir

# Auditoria completa (E2E + métricas) — CI
npm run auditoria

# Gera capturas de tela dos estilos
node tests/legendas/capturas.mjs
```

---

## 14. Limitações conhecidas

- **MP4 fragmentado**: `MediaRecorder` grava `moov` no final → não roda em players que exigem `faststart`. Use `ffmpeg -movflags faststart` se precisar.
- **WebGPU**: detectado mas `transformers.js` roda em WASM/q8 (CPU).
- **Modelo Whisper**: baixa ~50 MB na primeira transcrição (CDN). Para offline total, embarcar runtime+modelo no build.
- **Voz TTS**: só `Microsoft Maria Desktop` no Windows; variação de prosódia via SSML `rate` (-2, 0, +5).
- **Números fundidos**: token `,20.` vs referência "vinte centavos" infla p95 do clipe 04 (1209 ms) — é artefato de medição, não erro de sincronia.