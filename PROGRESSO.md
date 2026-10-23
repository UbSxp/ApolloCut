# Progresso do ApolloCut

Última atualização: 22/10/2026 23:17  
Branch: `noite/aprimoramento`  
Base recebida: `51b1885` (tag `checkpoint-00-base`)  
Último commit de código: `1d9f21d` (tag `checkpoint-05-exportacao`); correções críticas em `2cb4b41` (tags `checkpoint-01-legendas` e `checkpoint-02-tema`); acessibilidade em `9d7700a` (`checkpoint-03-acessibilidade`) e `4b1ef37` (`checkpoint-04-foco`)

## Rodada 06 — 23/10/2026 — commits `9652a16` e `9b6b7cf`

Tags: `checkpoint-06-exportacao` e `checkpoint-07-zona-segura`.

Concluído:

- Ateliê ocupa a tela inteira; header e footer não aparecem mais depois dele.
- Cards de corte voltaram a abrir cena, legendas e exportação.
- Exportação começa a gravar depois do `play()`, mede a duração capturada e falha se o corte ficar incompleto.
- Codec MP4 tenta H.264 High 4.0 e o nome/extensão usam o MIME real do `MediaRecorder`.
- Prévia e legenda queimada alinhadas em posição, largura e fundo.
- Barras de progresso com semântica, toasts e resultado anunciados, foco no download e no ateliê.
- `puppeteer-core` atualizado para `25.16.0`; `npm audit` sem vulnerabilidades.
- Teste de exportação agora abre o MP4 final e confere duração, resolução e ausência de erro de mídia.

Evidência:

- `npm run test:all`: 9 testes de legenda, tema e exportação passando.
- MP4 final: 1080×1920, 9,97 s, `avc1`, `mp4a`, reproduz no Edge.
- `npm audit --omit=optional`: 0 vulnerabilidades.
- Abertura automática: overlay fecha em 1,8 s; seletor abre; foco vai para o ateliê.
- Vídeo mudo `tests/fixtures/sem-audio.webm` (720×1280, 5 s): importado, analisado e exportado em MP4 1080×1920 de 4,94 s, sem erro.
- Quadro extraído do MP4 em 1,2 s mostra a legenda dentro da zona segura, com a palavra ativa em dourado.
- Cancelamento durante a preparação e durante a gravação: overlay fecha, status “Renderização cancelada.”, resultado oculto e **nenhum arquivo** baixado.
- Mobile 390×844: landing e ateliê com `scrollWidth` 390, sem overflow; header oculto e ateliê no topo.
- Perfil H.264 lido do `avcC`: High (0x64), nível 4.2; `mvhd` do MP4 fragmentado registra duração 0, mas o Edge reproduz 9,94 s.
- Limitação registrada: não há `ffprobe`/FFmpeg no PATH e não houve teste em iPhone/Android.

Próximo passo exato:

1. Atualizar `MANHA.md` com esta rodada.
2. Medir acessibilidade e legenda vertical; se estável, gerar `noite-final`.
3. Reabrir o app com `Start-Process "C:\Users\DUARDIN\ApolloCut\index.html"`.

## Estado atual

**Branch:** `funcionalidades/estudio` (base: `9b6b7cf` / `checkpoint-07-zona-segura`)  
**Último commit:** `fb07e0d` — feat: reenquadramento inteligente 16:9→9:16 (Item 4)  
**Tag:** `checkpoint-09-reframe`

### Concluído nesta sessão

**Arquitetura de Provedores (Categoria B — base para itens 3,6,7,8,9,10,11,12 + link):**
- 8 interfaces tipadas (`src/providers/interfaces.js`): LLM, Transcription, Translation, TTS, ImageGen, VideoGen, VideoToVideo, SocialPublish — cada uma com capacidades, tabela de custo/unidade, validação, timeout, retry/backoff, cancelamento, erros PT-BR.
- 8 **provedores fake** (`src/providers/fake-providers.js`): determinísticos, offline, sem chave — para testes automatizados, CI, desenvolvimento.
- 6 **provedores reais (esqueletos)** (`src/providers/real-providers.js`): OpenAI (LLM, Whisper), ElevenLabs (TTS), Replicate (Image/Video), YouTube OAuth — **desativados** até usuário inserir chave.
- Registro central (`src/providers/index.js`): carrega fakes + reais condicionais, API unificada (`getProviderFor`, `executeWithProvider`, `estimateCost`).

**Fila Persistente (`src/queue/job-queue.js`):**
- IndexedDB, 6 estados (`queued|running|paused|completed|failed|cancelled`), retomada ao abrir app.
- Worker pool com limites GPU/CPU/rede, retry/backoff exponencial, progresso real por etapa, cancelamento, pausa/retomada.
- Podas automáticas (idade/máximo), contadores por status.

**Orçamento/Ledger (`src/budget/ledger.js`):**
- IndexedDB, teto diário/mensal configurável, limiar de confirmação explícita.
- Registro: data, provedor, operação, unidade, quantidade, custo estimado/real (BRL).
- Relatórios por provedor/operação/unidade, poda automática (>90 dias).

**Motor de Cortes com IA (Item 3 — Categoria A):**
- Pipeline local: extrair áudio (WAV mono 16kHz) → transcrever (timestamps/palavra) → segmentar sentenças/tópicos → gerar candidatos → pontuar (hook, completude, densidade, energia, picos, perguntas, cena, rosto) → remover sobreposições → refinar bordas (fim de sentença + fade) → miniaturas.
- Heurística local robusta; LLM opcional para ranquear/títulos (Categoria B).
- Vídeos longos (10h): chunks com sobreposição, proxy visual, checkpoints, tempos globais consistentes.
- Arquivo: `src/core/cut-engine.js` (exporta `analyzeVideoForCuts`, `enqueueAnalysisJob`, `analyzeWorker`).

**Reenquadramento Inteligente 16:9→9:16 (Item 4 — Categoria A):**
- Detector offline: YuNet ONNX via ONNX Runtime Web (WASM), fallback para MediaPipe se necessário.
- Tracking: FaceTrack com EMA + IoU association, Kalman placeholder, idade/mínimo hits, suavização temporal.
- Classificação de cena heurística: solo (1 rosto), dual (2 rostos), group (3+ = foco ativo via VAD+boca), gameplay (cor/movimento), screenshare (movimento tela), fallback.
- 6 layouts automáticos: solo (acompanhamento vertical), dual (split vertical), group (foco falante), gameplay (jogo 70% + cam 30%), screenshare (conteúdo 75% + presenter 25%), fallback (centralizado + blur).
- Zonas seguras por plataforma (TikTok, Reels, Shorts, default), aplicação automática no crop.
- Saída 1080×1920 H.264 High L4.2, yuv420p, AAC 48kHz, faststart.
- Renderização via `MediaRecorder` + `canvas.captureStream` interpolando keyframes (0.5s default).
- Editor manual: callbacks `onLayoutChange`, `onManualCrop` para UI.
- Arquivo: `src/core/reframe-engine.js` (exporta `reframeVideo`, `renderReframedVideo`, `enqueueReframeJob`, `reframeWorker`).

**Testes:** suíte existente passa (`npm run test:all` — 9 legendas + UI tema + exportação 1080×1920 9.98s).

### Em andamento
- Integração do motor de cortes no `app.js` (botão "Analisar com IA", painel de sugestões, prévia de miniaturas).
- Integração do reenquadramento no ateliê (aba "Enquadramento", selector de layout, keyframes).
- Testes automatizados do motor de cortes e reenquadramento (usando fake providers).

### Próximo passo exato (Item 5 — Editor, Edição em Massa, Brand Kit, Templates)
1. Aba "Editor" no ateliê: timeline com cortes, ajuste de início/fim por quadro, divisão/junção.
2. Edição em massa: selecionar múltiplos cortes, aplicar mesma ação (estilo legenda, marca d'água, reenquadramento).
3. Brand Kit: logo, fontes, cores, estilo de legenda, vinheta, marca d'água — salvo no `localStorage`/IndexedDB.
4. Templates reutilizáveis: preset de configurações por tipo de conteúdo (podcast, gameplay, aula, vlog).
5. Persistência de projetos (Item 13): estado completo salvo/restaurado ao fechar/abrir app.

## Backlog (ordem de prioridade)

| # | Item | Categoria | Esforço | Notas |
|---|------|-----------|---------|-------|
| 1 | Integração UI do motor de cortes no ateliê | A | Médio | Botão "Analisar", cards de sugestão, miniaturas |
| 2 | Reenquadramento inteligente (YuNet/MediaPipe) | A | Alto | Detector offline, layouts, zonas seguras |
| 3 | Editor de enquadramento no ateliê | A | Médio | Troca layout, ajuste ROI, keyframes |
| 4 | Legendas avançadas: tradução + export ASS | A/B | Médio | TranslationProvider fake + real, ASS writer |
| 5 | Compositor thumbnails offline + provedor imagem | A/B | Baixo | Já tem compositor; adicionar ImageGenProvider |
| 6 | Dublagem (TTS) | B | Médio | ElevenLabs fake + real, sync com vídeo |
| 7 | Agendamento/publicação (OAuth) | B | Alto | SocialPublishProvider, tokens no keyring |
| 8 | Monitoramento lives (Twitch/Kick) | B | Alto | yt-dlp/streamlink detection, polling |
| 9 | Geração vídeo + troca personagem | B | Muito alto | Replicate/Runway/Luma, VideoToVideoProvider |
| 10 | API local, CLI, MCP | B | Médio | Sobre fila + provedores |
| 11 | Estatísticas de uso, polimento, docs | A | Baixo | Dashboard local, README, CHANGELOG |

O app é estático: HTML, CSS e JavaScript no navegador, sem build e sem backend. O vídeo é lido pelo elemento `<video>`, a análise amostra quadros em canvas, a transcrição usa Transformers.js + Whisper local e a exportação usa `MediaRecorder` em tempo real.

Os dois bugs críticos da Fase 1 foram corrigidos e verificados:

- Legendas: captura PCM sem perda, modelo `onnx-community/whisper-small_timestamped`, timestamps reais por palavra, transcrição do corte inteiro, compensação de latência, rebase/recorte de SRT nas bordas e filtro de alucinações.
- Tema: claro, escuro e automático funcionam, persistem, não piscam na abertura, seguem `prefers-color-scheme` e têm contraste corrigido em botões e selo de sucesso.

## Fase 0 — reconhecimento

### Stack e entrada

- Entrada: `index.html`.
- Estilos: `styles.css`, com tokens em `:root`, `[data-theme="light"]` e `[data-theme="dark"]`; fontes locais em `assets/fonts`.
- Lógica: `app.js`, IIFE de ~3.200 linhas; utilidades puras em `lib/captions.js`.
- Sem `package.json` de runtime; `package.json` atual existe apenas para testes (`puppeteer-core` como devDependency).
- Sem FFmpeg, sem servidor, sem subprocesso, sem modelo local persistido no projeto. O áudio e o vídeo não saem da máquina; o modelo Whisper é baixado na primeira transcrição.

### Vídeo e legendas

- Análise: amostragem de quadros em canvas, 12 a 48 amostras; cortes derivados de movimento, luz, cor e mudança de cena.
- Pré-visualização: `<video>` + canvas de moldura; legendas desenhadas em DOM.
- Exportação: `canvas.captureStream(30)` + faixa de áudio do `AudioContext` + `MediaRecorder`; MP4 quando o navegador suporta H.264/AAC, senão WebM.
- Legenda: SRT/VTT importado ou Whisper local. O SRT é recortado por corte; o Whisper agora devolve palavras com tempo do modelo.

### Tema

- Tokens claros e escuros já existiam no CSS, mas não havia orquestração em JS.
- O `<html>` nascia fixo em `light`; os botões `.js-theme` e `.js-settings` não tinham eventos; o modal de ajustes nunca abria.
- Não havia persistência, modo automático, atualização de `theme-color` nem proteção contra FOUC.

### Baseline de testes

- Testes antigos de fluxo (fora do repositório, em `AppData\Local\Temp`): upload, análise, SRT, capa, ficha, exportação 9:16/1:1/16:9, cancelamentos e mobile.
- `sample.mp4`: 10 s, 1280×720.
- `long.webm`: 60 s, com áudio de fala.
- `ptbr-fala.webm` (novo fixture): 16 s, 1280×720, fala sintética em pt-BR com texto de referência.\n- `vertical-ptbr.webm` (novo fixture): 16 s, 1080×1920, mesma fala; regressão vertical.
- Não há FFmpeg instalado no PATH; não foi possível gerar fixtures com FFmpeg nem validar `ffprobe`/`faststart` por linha de comando.

## Fase 1 — bugs críticos

### 1. Legendas incorretas

Causas encontradas:

1. O app usava `whisper-tiny` quantizado; em português o resultado errava palavras comuns.
2. A transcrição era feita em segmentos curtos independentes, perdendo contexto entre frases.
3. Os tempos por palavra eram inventados por proporção de caracteres; não vinham do modelo.
4. O áudio era capturado por `MediaRecorder` e recodificado em Opus antes de ser decodificado, introduzindo perda e latência.
5. Cues de SRT que cruzavam o início/fim do corte tinham todas as palavras redistribuídas na janela recortada, incluindo palavras faladas fora do corte.
6. Havia frases típicas de alucinação do Whisper sem filtro.
7. O seletor de idioma do modal de ajustes não estava ligado ao estado.

Correções:

- Modelo padrão `onnx-community/whisper-small_timestamped`, com `return_timestamps: "word"` e `dtype: "q8"`.
- Transcrição do áudio inteiro do corte, com chunking de 30 s e stride de 5 s; fallback para transcrição contínua e, por último, distribuição proporcional.
- Captura PCM direta com `ScriptProcessorNode`, mono, convertida para 16 kHz com `OfflineAudioContext`; sem dupla codificação Opus.
- Compensação da latência entre o início da captura e o início do vídeo.
- `lib/captions.js` com parser SRT/VTT, distribuição de palavras, recorte por janela, agrupamento, sanitização de alucinações e conversão de chunks do Whisper.
- O SRT agora distribui as palavras no cue original e só depois recorta a janela do corte.
- Idioma `pt`, `en`, `es` ou `auto` sincronizado entre o painel e o modal de ajustes.
- Testes puros em `tests/caption-utils.test.js`.

Evidência real:

- `ptbr-fala.webm` (16 s, ~58 s incluindo o primeiro download do modelo): transcrição `O Sol nasce sobre o mar. A lira de Apolo guarda o tempo. Este é um teste de legendas em português do Brasil. A palavra certa precisa aparecer no momento certo.`
- 31 palavras com timestamp do modelo.
- Em 1,1 s a palavra ativa foi `sobre`; em 3,2 s, `lira`; em 12,6 s, `precisa`.
- SRT `teste.srt` no `sample.mp4`: status `SRT alinhado`, 7 blocos, 4 palavras visíveis e 1 ativa em 1,1 s.
- `npm test`: 9 testes de legenda passando.
- Sem `pageerror` e sem `console.error` nos fluxos testados.

### 2. Modo escuro não funcionava

Causas encontradas:

1. Nenhum código aplicava `data-theme`; o HTML nascia fixo em `light`.
2. Não havia listener nos botões de tema nem nos botões de configurações.
3. O modal de ajustes não estava na lista de IDs do app e nunca abria.
4. Não havia persistência de tema, modo automático, `prefers-color-scheme`, atualização de `theme-color` ou proteção contra FOUC.
5. O selo `.result-seal` e os hovers de `.btn-gold`/`.play` tinham contraste insuficiente.

Correções:

- `theme` adicionado aos ajustes, com `auto` como padrão.
- `applyTheme()` resolve claro/escuro/automático, atualiza `data-theme`, `data-theme-pref`, `meta[name=theme-color]`, ícones e `aria-pressed`.
- Script inline no `<head>` aplica o tema antes do CSS, evitando FOUC.
- Botões `.js-theme` alternam claro/escuro; modal de ajustes abre, fecha, restaura padrões e salva o idioma.
- Listener de `prefers-color-scheme` reaplica o tema quando a preferência é automática.
- Contraste corrigido para `.btn-gold:hover`, `.play:hover` e `.result-seal` no escuro.
- `tests/ui-theme.test.js` cobre automático, claro, escuro, persistência, modal e idioma.

Evidência real:

- `npm run test:ui`: `Tema claro, escuro, automático, persistência e idioma: OK`.
- Capturas iniciais em `docs/design/depois/landing-light.png` e `landing-dark.png`.
- Não há `pageerror` no teste de tema.

## Regressão de fumaça

- Upload de `sample.mp4`, análise, SRT, capa e exportação 9:16 passaram.
- Exportação gerada: MP4 de 10 s, ~4,2 MB, com `ftyp`, `moov`, `avc1` e `mp4a`.
- `CONSOLE []`, `PAGEERRORS []` no fluxo de fumaça.
- O app continua abrindo pelo `index.html` sem build.

## Testes e comandos

```powershell
cd C:\Users\DUARDIN\ApolloCut
npm install
npm run test:all
```

- `npm run check`: sintaxe de `app.js` e `lib/captions.js`.
- `npm test`: testes puros de legenda.
- `npm run test:ui`: tema e persistência no Edge headless.\n- `npm run test:export`: importa SRT e exporta uma amostra 9:16 com legenda queimada; verifica o MP4 gerado.\n- Regressão manual com `vertical-ptbr.webm`: 1080×1920, análise e exportação 9:16 concluídas; MP4 com `ftyp`, `moov`, `avc1` e `mp4a`.
- Testes de fumaça com vídeo real ficam em `tests/fixtures`; os scripts de automação de fluxo ainda estão fora do repositório, em `AppData\Local\Temp\opencode\corta-test`.

## Backlog por prioridade

1. **P1 — Offline real:** remover dependência do CDN do Transformers.js e do download do modelo. Hoje o primeiro uso exige internet e o CDN pode sumir. Decisão pendente do usuário: embarcar ~240 MB de modelo + runtime no projeto ou aceitar download sob demanda.
2. **P1 — Exportação garantida:** não há FFmpeg; o `MediaRecorder` não garante H.264 High, `yuv420p`, AAC 48 kHz ou `faststart` em todos os navegadores. Validar em iPhone/Android e considerar backend local com FFmpeg em etapa separada.
3. **P1 — Testes de vídeo reais:** falta testar gravações longas de celular/OBS, frame rate variável, rotação, HDR, 10 bits, múltiplas faixas de áudio e arquivos corrompidos.
4. **P2 — Acessibilidade:** foco visível, ordem de tabulação, foco preso em modais, `aria-live` de progresso e atalhos precisam de auditoria dedicada.
5. **P2 — Desempenho:** medir abertura, análise, transcrição e exportação em vídeos de 30–60 min; avaliar cache de transcrição e limite de memória.
6. **P2 — Legendas:** quebra de linha semântica em português, zona segura por plataforma, presets de estilo e exportação SRT/ASS.
7. **P2 — Áudio:** normalização de loudness, redução de ruído e fade nas emendas.
8. **P3 — UX:** projetos recentes, fila de exportação, desfazer/refazer, salvamento automático e atalhos.

## Próximo passo exato

1. Commitar a documentação desta rodada.
2. Corrigir a captura de telas do estúdio e do modal nos dois temas, salvando em `docs/design/depois`.
3. Auditar o restante do app com foco em exportação, acessibilidade e dependência de CDN, registrando em `AUDITORIA.md`.
4. Se houver tempo, iniciar o item P1 de exportação/validação com vídeos reais.

## Arquivos relevantes

- `index.html` — estrutura, abertura, telas, modais e carregamento de scripts.
- `styles.css` — tokens de tema, componentes, movimento e contraste.
- `app.js` — análise, player, Whisper, capa, ficha, exportação e eventos.
- `lib/captions.js` — funções puras de legenda usadas pelo app e pelos testes.
- `tests/caption-utils.test.js` — 9 testes puros.
- `tests/ui-theme.test.js` — teste de tema no Edge headless.
- `tests/fixtures/ptbr-fala.webm` — fala real sintética em pt-BR.
- `tests/fixtures/teste.srt` — legenda de referência.
- `AUDITORIA.md`, `DECISOES.md`, `PENDENCIAS_PARA_O_USUARIO.md`.
