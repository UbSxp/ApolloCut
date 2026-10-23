# Progresso do ApolloCut

Última atualização: 22/10/2026 23:17  
Branch: `noite/aprimoramento`  
Base recebida: `51b1885` (tag `checkpoint-00-base`)  
Último commit de código: `1d9f21d` (tag `checkpoint-05-exportacao`); correções críticas em `2cb4b41` (tags `checkpoint-01-legendas` e `checkpoint-02-tema`); acessibilidade em `9d7700a` (`checkpoint-03-acessibilidade`) e `4b1ef37` (`checkpoint-04-foco`)

## Estado atual

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
