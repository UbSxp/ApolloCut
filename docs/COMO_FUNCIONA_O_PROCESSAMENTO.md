# Como funciona o processamento

Tudo acontece no navegador. Nenhum quadro, áudio ou texto sai da máquina — não há servidor de processamento, só um servidor estático (`tools/servir.mjs`) que entrega os arquivos com os cabeçalhos certos.

```
vídeo local ──► <video> ──► análise de áudio ──► cortes
                    │
                    ├──► OfflineAudioContext 16 kHz ──► Whisper (Web Worker) ──► legendas
                    │
                    └──► <canvas> + MediaRecorder ──► WebM final
```

## 1. Abertura

`INICIAR.bat` sobe `node tools/servir.mjs 4173`. Esse servidor envia:

- `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp` → `crossOriginIsolated = true`, o que libera `SharedArrayBuffer` e 2 threads no wasm;
- `Content-Type: application/wasm` para `.wasm` (sem isso o navegador cai para instanciação lenta ou falha);
- suporte a `Range`, para o `<video>` buscar trechos sem baixar o arquivo inteiro.

`src/ui/boot.js` roda como script clássico (antes de qualquer módulo) e:

- marca `document.documentElement.dataset.mode` como `file` ou `server`;
- mostra `#fileWarning` quando o protocolo é `file:`;
- guarda os últimos erros em `window.__APOLLO_ERRORS__`;
- expõe `window.__APOLLO_HEALTH__()`, que o painel de Diagnóstico usa.

## 2. Carregamento do vídeo

O `<input type="file">` entrega um `File`; o app cria `URL.createObjectURL(file)` e aponta o `<video id="previewVideo">` para ele. Quando chegam os metadados, `src/ui/dom.js` habilita `#analyzeBtn` e `#whisperBtn` e o player publica duração, largura e altura em `state`.

## 3. Análise (`src/ui/analysis.js`)

1. **Áudio** — `fetch(state.url)` → `decodeAudioData` → downmix para mono.
2. **Energia** — RMS em janelas de 50 ms com passo de 25 ms.
3. **Fala** — limiar por percentil (10% + 30% da distância até o p90); trechos com fala ≥ 300 ms separados por silêncio ≥ 150 ms viram segmentos.
4. **Pontuação** — `0,6 × proximidade da duração alvo + 0,4 × energia média`.
5. **Cortes** — abre uma janela do tamanho pedido em volta do centro dos segmentos mais energéticos, sem sobreposição. Se o vídeo for mais curto que a duração pedida, ou não tiver fala, divide em fatias iguais.

Cada corte vira um card em `#clipGrid`; `src/ui/clips.js` gera a miniatura em série (canvas 320×180, `drawImage` do `<video>` buscado no tempo do corte).

## 4. Transcrição (`src/ui/whisper.js` + `whisper-worker.js`)

1. **Áudio do corte** — `new OfflineAudioContext(1, segundos × 16000, 16000)` decodifica e reamostra o arquivo para mono 16 kHz. Usar `AudioContext` + `subarray` produzia áudio acelerado (o modelo ouvia "[música]").
2. **Guarda de áudio mudo** — RMS < 0,0015 → erro claro, sem chamar o modelo.
3. **Worker** — `whisper-worker.js` importa `/vendor/transformers.bundle.mjs` (bundle ESM local gerado por `scripts/vendor-transformers.mjs`), aponta `env.backends.onnx.wasm.wasmPaths = '/vendor/ort/'` e roda `pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { dtype: 'q8', device: 'wasm' })`. Se falhar, cai para `whisper-tiny`.
4. **Tempos** — `return_timestamps: true` devolve blocos. Cada bloco é dividido em palavras por `distributeWords` (peso = número de letras) e reagrupado por `groupWords` (máx. 4 palavras, 28 caracteres, 0,9 s de intervalo). Os tempos são corrigidos para não voltar atrás nem sobrepor.
5. **Resultado** — `state.cues` recebe tempos absolutos (início do corte + tempo relativo). O evento `whisper:result` faz `src/ui/captions.js` desenhar a legenda em `#captions` sincronizada com `timeupdate`.

> Por que não timestamp por palavra: o modelo q8 publicado não traz atenções cruzadas e o transformers.js lança `Model outputs must contain cross attentions to extract timestamps`. A distribuição por bloco é a alternativa honesta.

## 5. Edição (`src/ui/editor.js` + `clips.js`)

`state.clips` é a fonte da verdade. Marcar início/fim grava `markIn`/`markOut`; adicionar cria um corte manual; dividir troca um corte por dois no instante atual; apagar remove o ativo. Cada mutação empurra um snapshot JSON em `history` (máx. 60) e dispara `clips:changed`, que redesenha a grade, os marcadores da timeline e as legendas.

## 6. Exportação (`src/ui/export.js`)

1. **Canvas** no tamanho do enquadramento escolhido: 9:16 → 720×1280, 1:1 → 900×900, 16:9 → 1280×720.
2. **Enquadramento** — recorte central guiado por `settings.focus`; fonte mais larga que a saída corta nas laterais, mais alta corta em cima/embaixo.
3. **Legendas e marca** — `drawCaptions` desenha a cue ativa com contorno; `drawWatermark` assina o rodapé se ligado.
4. **Captura** — `canvas.captureStream(30)` + a faixa de áudio do `<video>` (via `MediaStreamDestination`) entram no `MediaRecorder` (VP9/VP8 + Opus, 5 Mbps).
5. **Laço** — `setInterval(33)` desenha e atualiza o progresso até o fim do corte. `requestAnimationFrame` foi abandonado porque é suspenso em aba não pintada e a barra ficava em 0%.
6. **Entrega** — `Blob` → `URL.createObjectURL` → link `apollocut-corte-N.webm`. O download só acontece quando o usuário clica; a suíte E2E clica.

O WebM do `MediaRecorder` não traz duração no cabeçalho — players mostram a duração ao abrir, e ferramentas como `ffprobe` só a obtêm contando pacotes.

## 7. Arquivos relevantes

| Caminho | Papel |
|---|---|
| `tools/servir.mjs` | servidor estático com COOP/COEP, MIME de wasm e range |
| `src/ui/boot.js` | aviso de `file://`, coleta de erros, `__APOLLO_HEALTH__` |
| `src/ui/analysis.js` | energia, fala, pontuação, cortes |
| `src/ui/whisper.js` / `whisper-worker.js` | áudio 16 kHz, inferência no worker, cues |
| `src/ui/captions.js` | SRT/VTT de entrada, render sincronizado, SRT/ASS de saída |
| `src/ui/editor.js` / `clips.js` | toolbar de edição, grade, undo/redo |
| `src/ui/export.js` | canvas + MediaRecorder |
| `src/ui/diagnostics.js` | painel de diagnóstico (`Ctrl+Shift+D`) |
| `lib/captions.js` | parsing, `distributeWords`, `groupWords` |
| `scripts/vendor-transformers.mjs` | gera `vendor/transformers.bundle.mjs` + `vendor/ort/` |
| `tests/e2e/run-all.mjs` | 6 verificações + 6 cenários de borda |
