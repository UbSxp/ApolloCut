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
- O Whisper é o modelo `tiny` quantizado (`q8`). Os tempos por palavra são distribuídos proporcionalmente dentro dos trechos de fala, não são timestamps exatos. Em fala rápida, a legenda pode adiantar ou atrasar; revisar antes de publicar.
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
