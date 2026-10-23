# Mudanças

## 23/10/2026 — exportação confiável e ateliê

- O ateliê agora ocupa a tela inteira, sem cabeçalho e rodapé aparecendo depois dele.
- Os botões dos cartões de corte voltaram a funcionar.
- A exportação não começa mais com o vídeo congelado: o primeiro quadro é desenhado e a gravação começa junto com a reprodução.
- Se o navegador entregar um arquivo incompleto, o app avisa e não baixa um vídeo truncado como se estivesse pronto.
- A exportação tenta H.264 High e usa o formato real entregue pelo navegador no nome do arquivo.
- A legenda queimada agora fica na mesma posição, largura e estilo da prévia.
- Barras de progresso, toasts e resultado da exportação passaram a ser anunciados por leitores de tela.
- O download recebe foco ao terminar; o ateliê também recebe foco ao abrir.
- O teste de exportação agora abre o MP4 final e confere duração, resolução e ausência de erro de mídia.
- Dependência de testes atualizada; `npm audit` sem vulnerabilidades.
- Novo fixture `sem-audio.webm` e teste de fumaça com vídeo mudo.

## 22/10/2026 — correção de legendas e temas

### Legendas

- O app agora usa um modelo Whisper maior e com timestamps reais por palavra.
- A transcrição passou a ouvir o corte inteiro, não pedaços isolados.
- O áudio é capturado sem recodificação lossy antes de ser transcrito.
- O app compensa o atraso entre o início da captura e o início do vídeo.
- SRTs que atravessam o começo ou o fim do corte não trazem mais palavras de fora.
- Frases típicas de alucinação do Whisper são removidas.
- O idioma escolhido nos ajustes passou a valer de verdade.

### Tema

- Modo claro, escuro e automático funcionam em todas as telas.
- O tema escolhido fica salvo e é aplicado antes da tela aparecer.
- O app acompanha a mudança de tema do sistema quando está no modo automático.
- O modal de ajustes passou a abrir e a salvar as preferências.
- Contraste corrigido em botões dourados e no selo de sucesso.

### Testes e documentação

- Testes puros de legenda.
- Teste de interface para tema, persistência e idioma.
- Teste automatizado de exportação com SRT e legenda queimada.
- Fixtures com fala em português do Brasil, incluindo versão vertical 1080×1920.
- README, PROGRESSO, DECISOES, PENDENCIAS e relatório de auditoria atualizados.

### Ainda pendente

- Distribuição totalmente offline do Whisper (runtime e modelo).
- Validação de exportação em iPhone/Android e com arquivos reais longos.
- Auditoria completa de acessibilidade.
