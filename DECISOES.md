# Decisões

## 23/10/2026 — rodada 06

### Exportação: gravar depois do `play()`

- Contexto: o `MediaRecorder` começava antes de o vídeo reproduzir; o início podia sair congelado ou sem áudio.
- Opções: iniciar antes e tentar compensar; iniciar depois de `play()`; usar FFmpeg (não existe no projeto).
- Escolha: desenhar o primeiro quadro, aguardar `play()` e então iniciar o recorder.
- Motivo: elimina a causa do congelamento sem depender de ferramenta externa. O custo é uma defasagem de poucos milissegundos no início, coberta pela margem dos testes.
- Reversão: `git revert 9652a16`.

### Exportação: falhar quando o corte fica incompleto

- Contexto: um arquivo truncado era exibido como concluído.
- Opções: baixar mesmo assim com aviso; impedir o download; tentar completar automaticamente.
- Escolha: se a duração capturada ficar mais de 0,25 s abaixo do alvo, não baixar e mostrar erro.
- Motivo: é melhor não entregar um arquivo errado. O usuário pode tentar novamente ou usar a amostra.
- Reversão: `git revert 9652a16`.

### Amostra de exportação nasce desmarcada

- Contexto: a amostra de 12 s vinha marcada e podia encurtar o corte sem o usuário perceber.
- Opções: manter marcada; desmarcar; remover a opção.
- Escolha: desmarcar por padrão e só tratar como amostra quando o corte tiver mais de 12 s.
- Motivo: exportar o corte inteiro é a expectativa natural; a amostra continua disponível para teste.
- Reversão: `git revert 9652a16`.

### Atualização do `puppeteer-core`

- Contexto: `23.11.1` tinha 7 vulnerabilidades altas de desenvolvimento.
- Opções: manter e documentar; atualizar para `25.16.0`.
- Escolha: atualizar e rodar toda a suíte.
- Motivo: `npm audit` zerou e os testes continuaram passando. A dependência não entra no app publicado.
- Reversão: `git revert 9652a16`.

### Sem CSP nesta rodada

- Contexto: o app usa um script inline no `<head>` para evitar FOUC de tema.
- Opções: adicionar CSP com `unsafe-inline`; remover o inline e aceitar FOUC; deixar para depois.
- Escolha: adicionar apenas `referrer=no-referrer` e registrar CSP no backlog.
- Motivo: uma CSP com `unsafe-inline` daria falsa sensação de proteção; remover o inline exigiria mudar a arquitetura de carregamento.
- Reversão: não se aplica. da rodada noturna

## 22/10/2026 22:37 — branch e estado inicial

- Contexto: o projeto já tinha git, mas o redesign estava em `design/apolo` com alterações não commitadas e a abertura do ateliê sem evento.
- Opções: continuar na branch de design; criar branch nova a partir do HEAD; commitar tudo antes.
- Escolha: criar `noite/aprimoramento` a partir do estado atual, commitar o estado recebido como `checkpoint-00-base` e seguir nela.
- Motivo: preserva o trabalho existente, deixa um ponto de retorno e cumpre a regra de branch da missão.

## 22/10/2026 22:50 — modelo de transcrição

- Contexto: o modelo `whisper-tiny` errava palavras em português e os tempos por palavra eram inventados.
- Opções: manter `tiny`; usar `base_timestamped`; usar `small_timestamped`.
- Escolha: `onnx-community/whisper-small_timestamped` com `dtype: "q8"`.
- Motivo: em teste real com fala sintética em pt-BR, `small_timestamped` transcreveu “A lira de Apolo guarda o tempo” corretamente; `base_timestamped` produziu “Apólogo/Arda”. O custo é um download maior e inferência mais lenta, aceitável para qualidade de legenda.
- Reversão: trocar `WHISPER_MODEL` em `app.js`.

## 22/10/2026 22:55 — timestamps de palavra

- Contexto: o modelo `whisper-base` normal não foi exportado com cross-attentions e falhava em `return_timestamps: "word"`.
- Opções: continuar distribuindo palavras por proporção; usar modelo `_timestamped`; não usar destaque por palavra.
- Escolha: usar o modelo `_timestamped` e pedir `return_timestamps: "word"`.
- Motivo: os tempos passam a vir do modelo, com evidência de 31 palavras e destaque correto de “sobre”, “lira” e “precisa” em pontos medidos.
- Fallback: se o modelo não devolver chunks, o app cai para transcrição contínua e distribuição proporcional; nunca finge que há timestamp real.

## 22/10/2026 23:00 — captura de áudio

- Contexto: `MediaRecorder` recodificava o áudio em Opus antes de decodificar de novo, introduzia latência e piorava a transcrição.
- Opções: MediaRecorder com bitrate maior; `ScriptProcessorNode`; AudioWorklet.
- Escolha: `ScriptProcessorNode` mono, com `OfflineAudioContext` para 16 kHz.
- Motivo: remove a dupla codificação, mantém a captura no navegador e melhora a transcrição sem nova dependência. É uma API legada, mas amplamente suportada no Edge/Chrome; AudioWorklet fica no backlog.
- Reversão: restaurar o bloco anterior de `captureClipAudio`.

## 22/10/2026 23:03 — transcrição do corte inteiro

- Contexto: transcrever segmentos curtos separados perdia contexto e piorava nomes próprios.
- Opções: manter segmentos; transcrever o corte inteiro com timestamps; transcrever com sobreposição manual.
- Escolha: transcrever o corte inteiro com `chunk_length_s: 30` e `stride_length_s: 5`.
- Motivo: melhora a coerência do texto e usa o chunking interno do Transformers.js. Se o modelo não suportar timestamps, há fallback contínuo.

## 22/10/2026 23:05 — SRT nas bordas do corte

- Contexto: cues que cruzavam o início/fim do corte tinham palavras de fora redistribuídas dentro da janela.
- Opções: descartar o cue inteiro; cortar o texto por proporção; manter todas as palavras.
- Escolha: distribuir as palavras no cue original e depois recortar cada palavra pela janela do corte; palavras sem sobreposição mínima são descartadas.
- Motivo: evita legenda adiantada/atrasada e não inventa palavras que não pertencem ao trecho.
- Teste: `tests/caption-utils.test.js` cobre início e fim de janela.

## 22/10/2026 23:08 — tema padrão

- Contexto: o CSS já tinha os dois temas, mas o HTML nascia claro e não havia persistência.
- Opções: padrão claro; padrão escuro; padrão automático.
- Escolha: `auto` como padrão, com preferência do sistema; o botão do cabeçalho alterna claro/escuro e o modal permite escolher os três.
- Motivo: respeita a preferência do usuário e mantém as três opções explícitas. O tema é aplicado por script inline no `<head>` para evitar FOUC.

## 22/10/2026 23:10 — áudio de conclusão

- Contexto: o modal de ajustes tinha “Som do ateliê”, mas nenhum som existia.
- Opções: remover o controle; deixar inerte; implementar um toque curto.
- Escolha: implementar três notas suaves em WebAudio, desligadas por padrão.
- Motivo: evita controle morto e mantém o áudio opcional, sem arquivo externo.

## 22/10/2026 23:15 — dependência de teste

- Contexto: o projeto não tinha testes de interface; o requisito pede teste automatizado de tema.
- Opções: teste manual; Puppeteer; Playwright; CDP puro.
- Escolha: `puppeteer-core` como `devDependency`, usando o Edge já instalado.
- Motivo: não entra no runtime, não baixa navegador, usa o Edge existente e permite testar DOM, persistência e eventos reais. Peso pequeno para o desenvolvedor.
- Limitação: a suíte de interface não roda sem `npm install`.

## 22/10/2026 23:17 — CDN do Whisper

- Contexto: o app ainda importa `@huggingface/transformers` de um CDN e baixa o modelo na primeira transcrição; isso conflita com a regra de não depender de recursos externos.
- Opções: embarcar runtime + modelo (~240 MB) no projeto; manter CDN; remover Whisper e deixar só SRT.
- Escolha provisória: manter CDN e download sob demanda nesta rodada, registrar como pendência P1.
- Motivo: embarcar o modelo é uma mudança grande de repositório e de estratégia de distribuição; remover Whisper reduziria funcionalidade. A correção de qualidade não deve ser bloqueada por essa decisão de empacotamento. O usuário precisa decidir o formato de distribuição offline.
- Reversão: nenhuma mudança de dados; trocar `WHISPER_CDN`/`WHISPER_MODEL` e empacotar os arquivos.

## 28/10/2026 — rodada 07 (auditoria total, branch `fix/app-100-funcional`)

### Abas: uma função só para trocar de aba

- Contexto: o clique das abas ia para os **painéis** (`#tabScene/#tabCaptions/#tabPublish`) em vez dos botões (`.console-tab[data-tab]`), então a aba II nunca abria. Vários controllers também mexiam em `hidden` de painel por conta própria.
- Opções: corrigir o seletor dentro de `dom.js`; criar um módulo de abas; deixar cada controller controlar seu painel.
- Escolha: módulo `src/ui/tabs.js` com `setTab(state, tab)`, `syncTabState(state)` e `setupTabs(state)`. Nenhum outro módulo altera `hidden` de painel.
- Motivo: o defeito nasceu de estado de UI espalhado. Uma fonte única impede a reincidência e concentra teclado (`←`/`→`), `aria-selected` e dicas.
- Reversão: `git revert` do commit `fix(abas)`.

### Aba bloqueada abre com dica, não com botão morto

- Contexto: publicar/legendar sem pré-requisito deixaria a aba vazia e sem saída.
- Opções: desabilitar o botão da aba; abrir a aba e mostrar dica com botão que leva ao passo que falta.
- Escolha: a aba sempre abre. `#captionsHint` e `#publishHint` aparecem quando falta pré-requisito, com `#publishGoScene` levando à aba I. Os botões de ação (`#coverBtn`, `#kitBtn`, `#exportBtn`, `#exportSrtBtn`, `#exportAssBtn`) ficam `disabled` até o estado existir.
- Motivo: o pedido é "nenhuma aba morta". Desabilitar a aba esconde o caminho; a dica ensina o caminho.
- Reversão: `git revert` do commit `fix(abas)`.

### Exportação: MP4/H.264 primeiro, WebM como queda

- Contexto: a UI prometia "MP4 · H.264 + AAC", mas `pickMime()` só tentava WebM. Neste Chromium `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')` é `true`.
- Opções: manter WebM e mudar o texto; tentar MP4 e cair para WebM; instalar FFmpeg.wasm.
- Escolha: tentar `video/mp4;codecs=avc1…` → `video/mp4` → WebM VP9/VP8. Extensão, `download` e rótulo saem do `blob.type`.
- Motivo: entrega o formato prometido sem dependência nova. O MP4 do `MediaRecorder` é fragmentado (sem `moov` no início), mas abre em navegador e é lido por `ffprobe`.
- Reversão: `git revert` do commit `feat(export-mp4)`.

### Ficha e capa passam a ler o que o usuário vê

- Contexto: `kit.js` escrevia `.value` em `<p>` (ficha sempre vazia), `.js-copy` não tinha listener, `#kitExport` só mostrava "simulado", `cover.js` ignorava `#coverTitle`/`#coverPreset`.
- Opções: criar campos novos; usar os elementos existentes.
- Escolha: `textContent` nos `<p>`, `navigator.clipboard` nos `.js-copy`, `#kitExport` dispara `kit:export` e o `ExportController` abre o modal. A capa lê título e preset e espera `readyState >= 2`.
- Motivo: os elementos já existiam e já estavam no design; faltava ligação.
- Reversão: `git revert` dos commits `fix(publicacao)` e `fix(capa)`.

### Legendas editáveis em blocos

- Contexto: não havia como corrigir o texto vindo do Whisper nem ajustar tempos.
- Opções: editar só o texto; lista de blocos com início/fim/texto/excluir.
- Escolha: lista de blocos (`#cueList`) com início, fim, texto e excluir, mais "+ adicionar bloco". `afterCuesChanged()` reordena, redesenha o quadro e atualiza SRT/ASS.
- Motivo: o Whisper erra nomes; sem edição o SRT exportado sai errado.
- Reversão: `git revert` do commit `feat(legendas-editaveis)`.

### Suíte E2E abre a aba II antes de baixar SRT/ASS

- Contexto: os botões de download vivem dentro de `#tabCaptions`. Fora da aba eles ficam `hidden` e `page.click` espera visibilidade; o teste antigo não abria a aba e o download estourava timeout.
- Escolha: a suíte clica em `.console-tab[data-tab="captions"]` antes de `#exportSrtBtn`/`#exportAssBtn`.
- Motivo: reproduz o caminho real do usuário em vez de furar a UI por `evaluate`.

### Legendas: timestamp por palavra do próprio modelo

- Contexto: `distributeWords` espalhava as palavras dentro do bloco do Whisper; o erro de tempo crescia com o tamanho do bloco (até 3,1 s).
- Opções: alinhamento forçado com um segundo modelo; `return_timestamps: 'word'` dos modelos `*_timestamped`.
- Escolha: `onnx-community/whisper-{tiny,base,small}_timestamped` com `return_timestamps: 'word'`, um modelo por modo (`fast`/`auto`/`precise`).
- Motivo: erro médio caiu de 505 ms para 77 ms sem custo extra de inferência. Alinhamento forçado ficou para depois: o viés residual (+50 a +90 ms) já está dentro da meta.
- Reversão: `git revert` do commit `feat(legendas-tempo)`.

### Tempo: corrigir só erro grosseiro de pausa, sem desconto fixo

- Contexto: o Whisper às vezes coloca a primeira palavra da frase seguinte dentro da pausa, ou na cauda da frase anterior.
- Opções: redistribuir todas as palavras dentro das regiões de fala (`alignToRegions`); mover só a palavra que caiu em pausa para o início real da fala; somar um desconto fixo de latência.
- Escolha: `alignWordsToSpeech` — só move quando a palavra está em silêncio ou na cauda (≤ 0,3 s) de uma região seguida de pausa > 0,6 s, só se o deslocamento for ≥ 0,2 s, no máximo 3 s, e **nunca** além do início da palavra seguinte.
- Motivo: `alignToRegions` foi descartado após 3 tentativas (piorava 01/04/08 em cascata). O desconto fixo de 60 ms foi medido e piorou (77 → 148 ms). O limite na palavra seguinte evita empate de tempo, que invertia a ordem do texto ("certo, Eu né?" em vez de "certo, né? Eu").
- Reversão: `git revert` do commit `feat(legendas-tempo)`.

### VAD com pausa mínima de 0,4 s

- Contexto: as regiões detectadas no áudio decodificado pelo navegador são mais fragmentadas que no wav do ffmpeg; com `minGap` 0,12 s cada respiração virava fim de frase e o encaixe empurrava frases inteiras.
- Escolha: `speechRegions(..., { minGap: 0.4 })` dentro do alinhamento.
- Motivo: pausa de 0,4 s é o mesmo limiar que encerra bloco de legenda, então as duas coisas concordam.

### `monotonic` corta o fim invasor antes de ordenar

- Contexto: ao empurrar uma palavra, o fim antigo dela (longo demais) invadia a próxima e o `monotonic` achatava a frase inteira em passos de 60 ms.
- Escolha: cortar `end` no `start` da palavra seguinte antes de garantir a ordem; piso de 60 ms por palavra.
- Motivo: foi o que tirou o erro médio de 148 ms para 77 ms.

### Resumo do `medir.mjs` soma por palavra, não o pior clipe

- Contexto: o p95 do resumo era `max` dos p95 por clipe; um token de número fundido (clipe 04) escondia o resultado real.
- Escolha: p95 e média sobre todas as palavras comparadas; a coluna por clipe continua mostrando o p95 de cada um.
- Motivo: a meta é "95% das palavras abaixo de 200 ms", que é uma conta sobre palavras, não sobre clipes.
