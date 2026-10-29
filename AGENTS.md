# ApolloCut — Instruções para a IA

> **Regra crítica:** nenhum caminho no código-fonte pode começar com `/`. Isso quebra o app quando publicado em subcaminho (ex.: GitHub Pages em `/ApolloCut/`).
> - Imports/Esm: use `new URL('vendor/transformers.bundle.mjs', import.meta.url).href`
> - Links/manifest: use caminhos relativos (`.`, `./`)
> - Fetches/static assets: use `new URL(..., document.baseURI)` ou caminhos relativos

Ao concluir cada prompt ou mudança grande, atualize `PROGRESSO.md` e este arquivo.

## Como rodar

```bash
node tools/servir.mjs 4173          # servidor local (porta 4173)
npm run testes                       # testes unitários
npm run fumaca                       # E2E abas + export
npm run auditoria                    # tudo + medição de legendas + teste de subcaminho
```

## Limites conhecidos

- Modelo embarcado: bundle ~1,2 MB + ort wasm ~21 MB no `vendor/`; download na 1ª transcrição.
- Download do corte: `POST /salvar` funciona no servidor local; `showSaveFilePicker` em navegadores sem servidor.
- Caminho absoluto (`/`) = bug em subcaminho. Regra registrada acima.
