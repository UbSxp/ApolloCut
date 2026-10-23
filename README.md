# ApolloCut

Ateliê local de cortes para vídeos curtos. O app lê um filme no navegador, sugere cortes verticais, alinha legendas reais e exporta o clipe com capa e ficha de publicação.

## Requisitos

- Microsoft Edge ou Google Chrome atualizado.
- JavaScript habilitado.
- Internet apenas na primeira transcrição com Whisper, para baixar o modelo. O áudio e o vídeo não são enviados a servidor.
- Espaço em disco para o modelo em cache do navegador (cerca de 240 MB na versão de alta precisão).

Não há build, servidor local obrigatório, FFmpeg ou backend.

## Como abrir

1. Abra `index.html` no Edge ou Chrome.
2. Clique em **Abrir o ateliê**.
3. Escolha um vídeo MP4, WebM, MOV ou MKV compatível com o navegador.
4. Leia o filme, escolha um corte na aba **Cena**.
5. Importe um SRT/VTT ou transcreva o corte na aba **Legendas**.
6. Revise, gere capa/ficha e exporte na aba **Publicar**.

O arquivo original nunca é enviado. A exportação acontece em tempo real no navegador.

## Atalhos e ajustes

- `Espaço`: reproduzir/pausar o corte.
- `←` / `→`: voltar/avançar 5 s no player.
- `Esc`: fechar modais.
- O botão de sol/lua no cabeçalho alterna entre dia e noite.
- A engrenagem abre os ajustes de tema, movimento, som e idioma.
- O tema **Automático** segue a preferência do sistema e reage a mudanças.
- A preferência é salva em `localStorage` e aplicada antes da primeira pintura.

## Testes

Os testes usam Node e o Edge instalado, sem baixar navegador.

```powershell
cd C:\Users\DUARDIN\ApolloCut
npm install
npm run test:all
```

- `npm run check`: verifica a sintaxe de `app.js` e `lib/captions.js`.
- `npm test`: testes puros de parser SRT/VTT, rebase, recorte, agrupamento e alucinações.
- `npm run test:ui`: testa tema claro/escuro/automático, persistência, modal de ajustes e idioma.
- `npm run test:export`: importa SRT e exporta uma amostra 9:16 com legenda queimada, verificando o MP4 gerado.

Os fixtures ficam em `tests/fixtures`:

- `sample.mp4`: vídeo curto sem fala.
- `long.webm`: 60 s com áudio.
- `ptbr-fala.webm`: 16 s com fala sintética em português do Brasil.
- `vertical-ptbr.webm`: 16 s, 1080×1920, com a mesma fala; usado na regressão vertical.
- `teste.srt`: legenda de referência.

## Limitações conhecidas

- A exportação usa `MediaRecorder`; o codec final depende do navegador. O app tenta MP4 H.264/AAC e cai para WebM quando necessário.
- A primeira transcrição baixa o modelo Whisper de um CDN/Hugging Face. Veja `PENDENCIAS_PARA_O_USUARIO.md`.
- A transcrição roda no navegador e pode ser lenta em vídeos longos.
- A análise visual sugere cortes por movimento, luz e mudança de cena; não entende o conteúdo semanticamente.
- O app não envia dados para a nuvem e não requer chave de API.

## Estrutura

- `index.html`: telas, modais e ícones.
- `styles.css`: tokens de tema, componentes, movimento e responsivo.
- `app.js`: análise, player, Whisper, capa, ficha e exportação.
- `lib/captions.js`: funções puras de legenda.
- `tests/`: testes e fixtures.
- `DESIGN.md`: direção visual.
- `PROGRESSO.md`, `DECISOES.md`, `AUDITORIA.md`, `PENDENCIAS_PARA_O_USUARIO.md`: memória da rodada.
