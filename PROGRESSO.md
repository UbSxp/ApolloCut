# Progresso — correção dos quatro defeitos críticos

Branch: `fix/quatro-bugs-criticos` · baseline: tag `checkpoint-antes-dos-bugs` (`d900baa`)

## Estado

| # | Defeito | Estado | Prova |
|---|---|---|---|
| 1 | Tema escuro/claro | Corrigido | verificação 2, `02-tema-*.png` |
| 2 | Processamento do vídeo | Corrigido | verificações 1 e 3, `03-processamento.png` |
| 3 | Edição e exportação | Corrigido | verificações 4 e 6, `corte-exportado.webm` |
| 4 | Transcrição das falas | Corrigido | verificação 5, `transcricao.json` |

Suíte E2E: **14/14 APROVADO** (`node tests/e2e/run-all.mjs`).

## Diário

1. **Baseline.** Branch e tag criadas, estado atual commitado (`d900baa`).
2. **Diagnóstico real no navegador.** `file://` mata módulos ES; sem `crossOriginIsolated`; `window.__APOLLO_DEBUG__` inexistente; tema sem listener; `#analyzeBtn`/`#whisperBtn` presos em `disabled`; `fetch(blob:)` bloqueado por CSP; exportação simulada; `@huggingface/transformers` não resolvia.
3. **Infra.** `tools/servir.mjs` (COOP/COEP, MIME de `.wasm`, range) e `ffmpeg-static`/`ffprobe-static` instalados; fixtures pt-BR geradas.
4. **Tema** — commit `a7cc849`.
5. **Edição + exportação** — commit `ff5c36c`: toolbar completa, undo/redo, grade com miniaturas, exportação real via canvas + MediaRecorder, SRT/ASS.
6. **Transcrição.** Bundle local do transformers, worker, áudio mono 16 kHz, fallback `whisper-tiny`. Descoberta: `return_timestamps:'word'` é impossível no modelo q8 → timestamps por bloco + distribuição de palavras.
7. **Fixtures.** Voz pt-BR com SSML e pausas de 700 ms entre frases (sem as pausas o Whisper ouvia "pela Libra-Oilete" no lugar de "pão e leite"). Adicionada fixture de 5 minutos (`longo-5min.mp4`, 300 s).
8. **Diagnóstico e boot.** Painel `Ctrl+Shift+D`, `__APOLLO_HEALTH__`, aviso de `file://`, checagem de saúde na inicialização.
9. **Suíte E2E** (`tests/e2e/run-all.mjs`): 6 verificações obrigatórias + 6 cenários de borda + erro de página. Falhas encontradas e corrigidas:
   - exportação não baixava sozinha (o teste passou a clicar em `#downloadLink`);
   - duração de WebM do MediaRecorder vem vazia no cabeçalho (medida por contagem de quadros);
   - overlay de exportação bloqueava o clique seguinte (fechado antes do teste de transcrição);
   - análise de 20 s termina em menos de 600 ms (cancelamento testado no mesmo tique e com reanálise depois);
   - vídeo sem áudio devolvia `Unable to decode audio data` em inglês (agora mensagem em português);
   - `long.webm` não tinha duração no cabeçalho (`Infinity`) → substituído por `longo-5min.mp4`.
10. **Scripts e docs.** `INICIAR.bat`, `TESTAR.bat`, `npm run servir|vendor|teste|fixtures`, `DIAGNOSTICO.md`, `LEIA_ME_PRIMEIRO.md`, `docs/COMO_FUNCIONA_O_PROCESSAMENTO.md`, `docs/relatorio.html`.

## Pendências conhecidas

- Timestamps são por bloco (não por palavra) — limitação do modelo exportado.
- WebGPU é detectado no diagnóstico, mas a inferência usa wasm/q8 por padrão (fp32 exigiria baixar centenas de MB).
- Exportação gera WebM (VP9/VP8 + Opus). MP4/H.264 via `MediaRecorder` não é suportado no Chromium.
- `vendor/` (50 MB) não vai para o git; `INICIAR.bat` e `npm run vendor` regeneram.
