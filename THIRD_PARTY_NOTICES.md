# Avisos de terceiros

## Fontes

- Cormorant Garamond — SIL Open Font License 1.1. Licença em `assets/fonts/cormorantgaramond-OFL.txt`.
- Cinzel — SIL Open Font License 1.1. Licença em `assets/fonts/cinzel-OFL.txt`.
- Manrope — SIL Open Font License 1.1. Licença em `assets/fonts/manrope-OFL.txt`.

## Runtime de transcrição

- `@huggingface/transformers` — Apache-2.0. Importado de CDN apenas quando o usuário transcreve.
- Modelo `onnx-community/whisper-small_timestamped` — derivado do Whisper da OpenAI (MIT), exportado em ONNX pela comunidade. Baixado no primeiro uso e mantido no cache do navegador.

## Ferramentas de desenvolvimento

- `puppeteer-core` — Apache-2.0, usado apenas nos testes de interface e exportação. Não faz parte do app estático.

## Observação

O app não inclui FFmpeg, modelos pagos, chaves de API ou serviços de nuvem. O áudio e o vídeo não são enviados a terceiros; apenas o runtime e o modelo de transcrição são baixados.
