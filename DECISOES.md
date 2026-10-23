# Decisões da rodada noturna

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
