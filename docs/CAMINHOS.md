# Inventário de caminhos absolutos (início com "/") encontrados no código-fonte

| Arquivo | Linha | Caminho original | Tipo | Correção aplicada |
|---|---|---|---|---|
| `src/ui/whisper-worker.js` | 39 | `/vendor/transformers.bundle.mjs` | import dinâmico (ESM) | `new URL('../../vendor/transformers.bundle.mjs', import.meta.url).href` |
| `src/ui/whisper-worker.js` | 44 | `/vendor/ort/` | configuração `wasmPaths` do ONNX Runtime | `new URL('../../vendor/ort/', import.meta.url).href` |
| `manifest.webmanifest` | 5 | `/` | `start_url` | `.` |
| `manifest.webmanifest` | 30 | `/?new=true` | atalho `url` | `./?new=true` |

*Nenhum outro caminho absoluto (`/vendor`, `/models`, `/assets`, `/fonts`, `/ffmpeg`, `/sw.js`, `/manifest`, `/favicon`, imports ou fetches iniciados com `/`) foi encontrado nos arquivos de origem (`src/`, `index.html`, `sw.js`, `manifest.webmanifest`).*