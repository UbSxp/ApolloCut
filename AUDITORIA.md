# Auditoria do ApolloCut

Data: 22/10/2026  
Escopo: `C:\Users\DUARDIN\ApolloCut` (HTML/CSS/JS estático, sem backend)  
Navegador de verificação: Microsoft Edge headless  
Método: leitura do código, execução real dos fluxos e inspeção do DOM/arquivos gerados.

## Resumo

O ApolloCut estava com a maior parte da lógica escrita, mas **não inicializava**: faltavam o vínculo dos eventos, a chamada de inicialização e o ajuste visual das configurações. Também havia falhas de duração de vídeo, alinhamento de legendas após o Whisper, duplicação no fim do HTML e pequenos erros de CSS.

Após as correções, os fluxos principais foram executados de ponta a ponta e passaram:

- abrir vídeo e ler metadados;
- analisar o filme e gerar cortes;
- importar SRT/VTT e alinhar legendas por corte;
- transcrever com Whisper local;
- gerar capa e ficha de publicação;
- exportar MP4 em 9:16, 1:1 e 16:9;
- cancelar análise, exportação e transcrição;
- persistir ajustes após recarregar;
- usar a interface em tela móvel sem overflow horizontal.

## Rodada noturna — 22/10/2026

### Resolvidos

| ID | Severidade | Área | Problema | Correção | Evidência |
|---|---|---|---|---|---|
| LEG-01 | P0 | Legendas | Tempos por palavra eram inventados por proporção de caracteres. | Whisper `small_timestamped` com `return_timestamps: "word"`; fallback explícito. | 31 palavras com timestamp; `sobre` em 1,1 s, `lira` em 3,2 s, `precisa` em 12,6 s. |
| LEG-02 | P0 | Legendas | Modelo `tiny` errava português e segmentos curtos perdiam contexto. | Modelo maior e transcrição do corte inteiro com chunking. | Texto de referência pt-BR transcrito corretamente em `tests/fixtures/ptbr-fala.webm`. |
| LEG-03 | P0 | Áudio | `MediaRecorder` recodificava o áudio antes da transcrição. | Captura PCM com `ScriptProcessorNode` e resample para 16 kHz. | Transcrição corrigida de “Apólogo/Arda” para “Apolo/guarda”. |
| LEG-04 | P1 | Legendas | Cues SRT que cruzavam o corte incluíam palavras de fora. | Distribuição no cue original e recorte por janela. | Testes 4 e 5 de `tests/caption-utils.test.js`. |
| LEG-05 | P1 | Legendas | Alucinações típicas do Whisper entravam na legenda. | Sanitização de frases conhecidas e texto sem letras/números. | Testes 6 e 8 de `tests/caption-utils.test.js`. |
| LEG-06 | P1 | Configuração | Idioma do modal de ajustes não fazia nada. | `settingsLang` ligado ao estado e ao seletor do painel. | `tests/ui-theme.test.js` verifica persistência do idioma. |
| TEMA-01 | P0 | Tema | Nenhum JS aplicava `data-theme`; botões e modal inertes. | `applyTheme`, listeners, persistência e modal ligados. | `npm run test:ui` passou. |
| TEMA-02 | P1 | Tema | FOUC e ausência de modo automático. | Script inline no `<head>`, `prefers-color-scheme` e listener de mudança. | Teste de tema com mídia escura e `auto`. |
| TEMA-03 | P1 | Contraste | Hover dourado e selo de sucesso com contraste insuficiente. | Texto escuro nos hovers e override do selo no tema escuro. | Revisão de CSS; capturas em `docs/design/depois`. |
| ABERTURA-01 | P1 | Entrada | A tela de abertura cobria o app e “Entrar no ateliê” não tinha evento. | Dispensa por clique e automática em 1,5 s. | Fluxo de upload abriu o seletor e o estúdio. |

### Abertos por prioridade

| ID | Severidade | Área | Problema | Impacto | Correção proposta | Esforço |
|---|---|---|---|---|---|---|
| OFF-01 | P1 | Dependências | Transformers.js e modelo vêm de CDN/Hugging Face. | Primeira transcrição exige internet; CDN pode sumir. | Empacotar runtime + modelo ou definir download sob demanda como contrato. | Alto |
| EXP-01 | P1 | Exportação | `MediaRecorder` não garante H.264 High/yuv420p/AAC/faststart. | Compatibilidade e qualidade variam por navegador. | Validar em dispositivos; avaliar backend FFmpeg local. | Alto |
| VID-01 | P1 | Pipeline | Sem testes com arquivos reais longos, VFR, rotação, HDR, 10 bits e múltiplas faixas. | Falhas silenciosas em casos reais. | Criar fixtures e matriz de testes com ffprobe/ffmpeg. | Médio |
| A11Y-01 | P2 | Acessibilidade | Falta foco preso em modais, retorno de foco e anúncio de progresso. | Navegação por teclado/leitor de tela incompleta. | Auditoria com teclado e axe; implementar `focus trap` e `aria-live`. | Médio |
| PERF-01 | P2 | Desempenho | Transcrição e exportação em tempo real; sem cache de transcrição. | Vídeos longos ficam lentos. | Medir, cachear por arquivo/corte e limitar concorrência. | Médio |
| LEG-07 | P2 | Legendas | Quebra de linha é por largura, sem regra semântica de português. | Linhas podem separar artigo/substantivo. | Implementar quebra por unidades linguísticas e testar. | Baixo |
| AUDIO-01 | P2 | Áudio | Sem normalização de loudness, redução de ruído ou fade nas emendas. | Volume inconsistente e estalos. | Adicionar análise e processamento no grafo de áudio. | Médio |
| UX-01 | P3 | UX | Sem projetos recentes, fila de exportação, desfazer/refazer e salvamento automático. | Fluxos longos exigem retrabalho. | Planejar estado persistente e fila. | Alto |

## Estado encontrado

- `app.js` terminava em `// PART7` + `})();`, sem `bindEvents`, `init` ou `applySettingsUI`.
- O arquivo HTML carregava `app.js`, mas o aplicativo ficava inerte: o clique em “Abrir o ateliê” não abria o seletor de arquivo.
- A duração era lida apenas de `video.duration`; alguns arquivos informam `Infinity` ou `NaN` no primeiro momento.
- Após o Whisper, a legenda era renderizada com o tempo antigo do player, podendo ficar vazia até o usuário mover o vídeo.
- O fim do `index.html` tinha `script`, `body` e `html` duplicados.
- Havia um seletor CSS inválido (`.git .hero-actions`), falta de regra para miniaturas em `<img>` e ausência de bloqueio de rolagem com modal aberto.
- Existiam instrumentações de depuração (`window.__APOLLO_DEBUG__`) no código.
- Exportação cancelada registrava um `console.error` desnecessário.
- Não havia repositório git antes da revisão; o estado inicial foi congelado em um commit de base.
- Não havia testes automatizados, `package.json`, README ou CI no projeto.

## Correções aplicadas

1. Ligação completa de eventos, inicialização, restauração de ajustes e atualização da UI.
2. Leitura de duração com fallback (`resolveVideoDuration`), incluindo `seekable` e busca por `durationchange`/`seeked`.
3. Após o Whisper, pausa e posicionamento no início do corte para exibir a primeira legenda.
4. Remoção da duplicação no fim do `index.html`.
5. CSS: bloqueio de rolagem com modal, miniatura em `<img>`, correção do seletor do hero e ajustes responsivos.
6. Remoção das instrumentações de depuração.
7. Exportação cancelada deixou de poluir o console.
8. Ajuste no fluxo de corte: a janela de legendas passou a ser recalculada a cada leitura.

## Verificações reais

### Vídeo curto (10 s, sem fala)

Arquivo: `sample.mp4` (1280×720). Resultado:

- upload e metadados: OK;
- análise: 1 corte de 10 s;
- SRT: importado e alinhado;
- capa: 1080×1920, conteúdo não vazio;
- exportação 9:16: MP4 de 10 s, 4,2 MB, com `ftyp`, `moov`, `avc1` e `mp4a`;
- console e `pageerror`: vazios.

### Vídeo longo (60 s, com fala)

Arquivo gerado para teste: `long.webm` (60 s, áudio JFK repetido, seis cenas visuais). Resultado:

- análise: 3 cortes de 15 s;
- SRT de 12 falas: 10, 9 e 6 blocos distribuídos nos cortes;
- exportação 1:1: 1080×1080, 12 s, 1,3 MB, MP4 `avc1`/`mp4a`;
- exportação 16:9: 1920×1080, 12 s, 2,0 MB, MP4 `avc1`/`mp4a`;
- console e `pageerror`: vazios.

### Whisper local

- Corte de 10 s: 7 blocos transcritos em ~17 s, com modelo em cache;
- corte de 15 s: 7 blocos em ~21 s, legenda visível no player, overlay fecha sozinho;
- console e `pageerror`: vazios;
- o primeiro uso baixa o modelo e exige internet; depois o modelo fica no cache do navegador.

### Capa, ficha e cancelamentos

- Capa 1080×1920 gerada e baixada em PNG;
- ficha com título, descrição e hashtags derivadas da transcrição, baixada em `.txt`;
- cancelar análise: overlay fecha, nada é alterado;
- cancelar exportação: nenhum arquivo é baixado e o status fica “Renderização cancelada.”;
- cancelar Whisper: overlay fecha, vídeo pausa e as legendas anteriores permanecem;
- ajustes (duração, quantidade, foco, formato, estilo e marca) persistem após recarregar.

### Layout móvel

Viewport 390×844:

- landing e estúdio sem overflow horizontal;
- três abas de 116 px;
- card de corte com 350 px de largura;
- console e `pageerror`: vazios.

## Limitações conhecidas

- A exportação usa `MediaRecorder` em tempo real. Um corte de 60 s leva aproximadamente 60 s para renderizar.
- Não há FFmpeg, controle de keyframe, CRF, `faststart`, perfil H.264 ou normalização de volume. O resultado depende dos codecs do navegador.
- O MP4 só é gerado quando o navegador oferece `video/mp4` com H.264/AAC; caso contrário, o app usa WebM.
- O Whisper usa `onnx-community/whisper-small_timestamped` quantizado (`q8`) e devolve timestamps reais por palavra quando o modelo os suporta. Se o navegador/modelo não devolver chunks, o app cai para distribuição proporcional e registra isso no log. A primeira transcrição ainda exige internet para baixar o modelo.
- O primeiro download do Whisper é grande e exige internet. Nenhum áudio é enviado a servidor.
- A análise visual amostra de 12 a 48 quadros e sugere cortes; não é uma edição semântica do conteúdo.
- MOV/MKV dependem do suporte do navegador. Para máxima compatibilidade, usar MP4 H.264.
- A capa e a ficha são geradas localmente; não há geração de vídeo ou imagem por IA.
- Ainda não foi testado com gravações reais longas do usuário (celular, OBS, entrevistas, etc.).

## Próximos passos recomendados

1. Testar com um vídeo real longo (10–60 min) e um SRT real do usuário.
2. Testar MP4 H.264 com áudio, MOV de celular e um arquivo sem faixa de áudio.
3. Medir tempo de análise e de exportação em um arquivo de 30–60 min.
4. Revisar o resultado do Whisper em fala rápida e com música de fundo.
5. Se o usuário precisar de exportação mais rápida ou codecs garantidos, avaliar um backend local com FFmpeg em uma etapa separada.
