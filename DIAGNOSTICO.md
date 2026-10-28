# Diagnóstico — os quatro defeitos críticos

Como a evidência foi coletada: Chromium 1248 via Playwright, servidor `tools/servir.mjs` em `http://127.0.0.1:4173`, capturas em `docs/evidencias/`. Cada defeito abaixo traz a reprodução, o erro exato e o ponto do código onde ele nascia.

---

## 1. Tema escuro/claro não funcionava

**Reprodução.** Abrir o app, clicar no ícone de lua no cabeçalho (ou em "Noite" nas configurações). Nada muda. Recarregar: continua claro.

**Causa.** Os botões existiam, o handler não.

- `index.html:127` e `index.html:494` — `<button class="icon-btn js-theme">`, sem nenhum `addEventListener`.
- `index.html:927` — `#themeChoice` (Dia / Noite / Automático), sem handler.
- `src/ui/main.js:117` — `applyTheme()` só era chamado uma vez na inicialização, então o valor persistido nunca era reaplicado depois de uma troca.

**Correção.** `src/ui/theme.js` (novo): `ThemeController` aplica `data-theme`, persiste em `settings.theme` (`dark`/`light`/`auto`), atualiza `aria-pressed`, o ícone sol/lua e `meta[name=theme-color]`. Ligado em `src/ui/main.js:50`.

**Prova.** `docs/evidencias/02-tema-1.png`, `02-tema-2.png`; verificação 2 da suíte (`light → dark`, persiste após reload).

---

## 2. Processamento do vídeo não andava

**Reprodução.** Carregar um vídeo: o botão "Ler o filme" continua apagado. Abrindo o `index.html` com dois cliques: a página fica vazia de comportamento.

**Erros exatos.**

- `file://` → `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"` e nenhum módulo ES executa.
- `Refused to connect to 'blob:http://localhost:3000/...' because it violates the following Content Security Policy directive: "connect-src 'self' https://cdn.jsdelivr.net"`.
- `index.html:591` e `index.html:623` — `#analyzeBtn` e `#whisperBtn` nasciam com `disabled`, e nada no código os reabilitava depois do vídeo carregado.

**Correção.**

- `src/ui/dom.js:167-168` — habilita `#analyzeBtn` e `#whisperBtn` quando o vídeo tem metadados; `:270-271` volta a desabilitar ao limpar.
- CSP: `connect-src` agora inclui `blob: data:`, necessário para `fetch(blob:)` do áudio.
- `tools/servir.mjs` (novo): serve em `4173` com `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`, `Content-Type: application/wasm` e `Range`.
- `src/ui/boot.js` (novo, script clássico): detecta `file://`, mostra o aviso `#fileWarning` e expõe `window.__APOLLO_HEALTH__()`.
- Service worker de `sw.js` removido do `index.html` (era ele que servia `.wasm` como `application/octet-stream` e assets velhos).

**Prova.** `docs/evidencias/01-isolamento.png`, `03-processamento.png`; verificações 1 e 3 (4 cortes, 4 miniaturas reais).

---

## 3. Edição e exportação não existiam

**Reprodução.** Marcar início/fim, cortar, dividir: nada acontecia. Exportar: barra enchia, aparecia "Download (simulado)" e nenhum arquivo era gerado.

**Causa.** O código dizia isso na cara:

- `src/ui/export.js:136-137` — `// For now, we'll just simulate the export` + `await new Promise(resolve => setTimeout(resolve, 1000))`.
- `src/ui/export.js:165` — `downloadLink.textContent = 'Download (simulado)'`, sem `href` nem `Blob`.

**Correção.**

- `src/ui/export.js` reescrito: desenha o corte num `<canvas>` (enquadramento 9:16 / 1:1 / 16:9, foco, legendas queimadas, marca d'água) e grava com `MediaRecorder` + `canvas.captureStream(30)` + áudio do `<video>` via `MediaStreamDestination`. Entrega `Blob` WebM VP9/VP8 + Opus.
- Bug encontrado no caminho: o progresso travava em `0%` porque o laço usava `requestAnimationFrame`, suspenso em aba não pintada. Trocado por `setInterval(33)`.
- `src/ui/editor.js` + `src/ui/clips.js`: marcar início/fim, adicionar corte, dividir, apagar, desfazer/refazer (snapshots de `state.clips`, máx. 60), grade de cortes com miniatura real, seleção e `playRange`.
- `src/ui/captions.js`: exportação `.srt` e `.ass` (`#exportSrtBtn`, `#exportAssBtn`).

**Prova.** `docs/evidencias/04-exportacao.png`, `corte-exportado.webm` (720×1280, VP9, 90 quadros, 3 s), `legendas.srt`, `legendas.ass`; verificações 4 e 6.

---

## 4. Transcrição das falas quebrada

**Reprodução.** Abrir o modal do Whisper e mandar transcrever. O log mostra erro imediato e nenhuma legenda aparece.

**Erros exatos.**

- `Failed to resolve module specifier "@huggingface/transformers". Relative references must start with either "/", "./", or "../".` — `src/ui/whisper.js:51` fazia `await import('@huggingface/transformers')` direto no navegador, sem import map nem bundle.
- Depois de empacotar: `Error: Model outputs must contain cross attentions to extract timestamps. This is most likely because the model was not exported with output_attentions=True.` — o modelo `onnx-community/whisper-base` (q8) não traz atenções cruzadas, então `return_timestamps: 'word'` nunca funciona.
- `wasm streaming compile failed: ... Incorrect response MIME type. Expected 'application/wasm'` — service worker antigo servindo o `.wasm` errado.

**Correção.**

- `scripts/vendor-transformers.mjs` (novo) gera `vendor/transformers.bundle.mjs` (ESM, 1.1 MB) e copia o wasm do onnxruntime para `vendor/ort/`. Sem CDN, sem import map.
- `src/ui/whisper-worker.js` (novo): roda a inferência num Web Worker; `wasmPaths = '/vendor/ort/'`, `numThreads = crossOriginIsolated ? 2 : 1`, fallback para `whisper-tiny`.
- `src/ui/whisper.js`: extrai o áudio do corte em mono 16 kHz com `OfflineAudioContext` (o `AudioContext` + `subarray` produzia áudio acelerado e o modelo ouvia "[música]"), detecta áudio mudo, e converte os blocos em palavras com `distributeWords` + `groupWords` do `lib/captions.js`.
- Limitação assumida: os tempos são por bloco, distribuídos por peso de palavra — monotônicos e sem sobreposição, mas não são timestamps de palavra do modelo.

**Prova.** `docs/evidencias/05-transcricao.png`, `transcricao.json`; verificação 5 (7 blocos, 3 de 5 palavras-chave: mercado, vizinho, filme).

---

## Cenários de borda cobertos pela suíte

| Cenário | Resultado |
|---|---|
| Vídeo sem áudio | Erro claro: "Este vídeo não tem áudio decodificável…" (B1) |
| Arquivo corrompido | Recusado com toast, análise continua desabilitada (B2) |
| Cancelar no meio da análise | Interface destrava e permite reanalisar (B3) |
| Trocar tema durante o processamento | Tema troca e a análise chega a 100% (B4) |
| Recarregar no meio de uma operação | App volta são (B5) |
| Vídeo de 5 minutos | Carrega (300 s) e analisa (B6) |

Resultado completo: `docs/evidencias/resultado.json` e `docs/evidencias/e2e-run.log`.
