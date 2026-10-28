# Pendências para o usuário

## 1. Distribuição offline do Whisper

O app ainda importa `@huggingface/transformers` do CDN da jsDelivr e baixa o modelo `onnx-community/whisper-small_timestamped` na primeira transcrição. Isso conflita com a regra de não depender de CDN.

Opções:

- Embarcar runtime e modelo no projeto (cerca de 240 MB de modelo, mais o runtime e os arquivos WASM).
- Manter o download sob demanda e documentar que a primeira transcrição exige internet.
- Remover o Whisper do produto e trabalhar apenas com SRT/VTT importado.

Enquanto não houver decisão, o app funciona, mas não é 100% offline na primeira transcrição.

## 2. Exportação sem FFmpeg

Não há FFmpeg no PATH e o app é 100% navegador. A exportação usa `MediaRecorder`, então não é possível garantir em todos os navegadores:

- H.264 High e `yuv420p`;
- AAC 48 kHz;
- `faststart`;
- sincronia de 40 ms em arquivos longos;
- ausência de quadros pretos/congelados nas bordas;
- bitrate/CRF controlados.

O MP4 gerado no Edge foi validado por assinatura de container (`ftyp`, `moov`, `avc1`, `mp4a`), perfil `avcC` High/nível 4.2 e reprodução no próprio Edge (1080×1920, 9,97 s). O `mvhd` registra duração 0 por ser MP4 fragmentado.

Na rodada 07 (28/10/2026) o MP4 do `MediaRecorder` passou a ser o formato preferido e foi validado com `ffprobe`: container `mov,mp4,m4a,3gp,3g2,mj2`, vídeo `h264` 720×1280, 4,98 s e 120 quadros. Continua fragmentado — o `moov` fica no fim do arquivo, não há `faststart` e alguns players mostram duração 0 até terminar a leitura. O WebM (VP9/Opus) segue como queda quando o navegador não suporta MP4. Ainda não foi validado em iPhone/Android.

Decisão necessária: aceitar a limitação do navegador ou autorizar uma etapa futura com backend local FFmpeg.

## 3. Testes com vídeos reais

Ainda faltam testes com:

- gravações longas de celular e OBS (30–60 min);
- frame rate variável;
- metadado de rotação;
- HDR e 10 bits;
- múltiplas faixas de áudio;
- arquivos corrompidos ou com codecs incomuns;
- caminhos com espaço, acento e apóstrofo.

Os fixtures atuais são curtos e sintéticos (`sample.mp4`, `long.webm`, `ptbr-fala.webm`).

## 4. Acessibilidade e foco em modais

Foco visível, foco preso nos modais, retorno de foco, anúncio de progresso e foco no resultado da exportação já estão implementados. Ainda falta auditar:

- navegação completa por teclado no editor de legendas;
- leitura com NVDA, JAWS ou VoiceOver reais;
- contraste de todos os estados (hover, foco, desabilitado) nos dois temas.

## 4.1. CSP e script inline

O app usa um script inline no `<head>` para aplicar o tema antes da primeira pintura. Uma CSP estrita exigiria remover esse inline ou usar `unsafe-inline`. A decisão atual foi manter o inline e adicionar apenas `referrer=no-referrer`; CSP fica no backlog.

## 5. Limpeza de arquivos temporários

Os scripts de automação de fluxo ainda estão em `C:\Users\DUARDIN\AppData\Local\Temp\opencode\corta-test`. Eles não fazem parte do repositório. Se quiser, podem ser movidos para `tests/e2e` em uma próxima rodada.

## 6. Nome e identidade

O app continua com o nome `ApolloCut`. Nenhuma troca de nome foi feita. A sugestão de três nomes alternativos ainda não foi produzida.
