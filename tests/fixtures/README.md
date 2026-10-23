# Fixtures de teste

- `sample.mp4`: vídeo curto de 10 s, 1280×720, sem fala, usado no fluxo de análise/exportação.
- `long.webm`: vídeo de 60 s com áudio de fala, usado para testar chunking e arquivos mais longos.
- `ptbr-fala.wav`: áudio sintético em português do Brasil, gerado localmente com a voz Microsoft Maria (Windows SAPI). Texto de referência: “O sol nasce sobre o mar. A lira de Apolo guarda o tempo. Este é um teste de legendas em português do Brasil. A palavra certa precisa aparecer no momento certo.”
- `ptbr-fala.webm`: o mesmo áudio com uma faixa de vídeo sintética 1280×720, usado para testar upload, análise e Whisper no app.
- `vertical-ptbr.webm`: o mesmo áudio com uma faixa de vídeo sintética 1080×1920, usado na regressão vertical.
- `teste.srt`: legenda de referência em inglês usada no teste de importação.
- `gen-pt-video.html` e `gen-vertical.html`: geradores locais dos fixtures com áudio.

Os fixtures são sintéticos e não contêm dados pessoais. O áudio foi produzido pelo SAPI do Windows; não há obra musical ou trecho de terceiros.
