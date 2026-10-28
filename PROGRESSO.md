# Progresso — app 100% funcional (rodada 07)

Branch: `fix/app-100-funcional` · baseline: tag `checkpoint-antes-da-auditoria-total` (`f4452dc`)

## Estado

| # | Sintoma | Estado | Prova |
|---|---|---|---|
| 1 | Prévia dos cortes não aparecia | Corrigido | `abas-e-previa` check 3 (4 imgs, 0 placeholders) |
| 2 | Aba II · Legendas não abria | Corrigido | `abas-e-previa` checks 1–2, `run-all` check 6 |
| 3 | App "não funcionava como deveria" | Corrigido nos 9 elementos mortos | `DIAGNOSTICO.md` §Rodada 07, suítes verdes |

Suítes: `node tests/e2e/run-all.mjs` **14/14** · `node tests/e2e/abas-e-previa.mjs` **10/10**.

## Diário

1. **Baseline.** Branch e tag criadas a partir de `fix/quatro-bugs-criticos` (`f4452dc`), árvore limpa.
2. **Mapa do app.** `docs/MAPA_DO_APP.md` com telas, elementos→handler, fluxo de estado e a máquina `idle → loaded → analyzed → captioned → exported`.
3. **Diagnóstico.** `DIAGNOSTICO.md` §Rodada 07 com evidência DOM das duas causas: listener de aba no painel escondido e placeholder `.clip-thumb-loading` cobrindo a miniatura.
4. **Abas** — commit `2fbf242`: `src/ui/tabs.js` (`setTab`, `syncTabState`, `setupTabs`), dicas de pré-requisito, `#studioBack`, `#quickCaptionsBtn`, `#quickCoverBtn`, X da análise.
5. **Prévia** — commit `b37cf7a`: placeholder substituído pela imagem; selecionar corte move o player e o rótulo.
6. **Legendas, ficha, capa e MP4** — commit `ba291ba`: editor de blocos, `textContent` na ficha, `.js-copy`, `#kitExport` abrindo o modal, capa lendo título/preset, MP4/H.264 antes de WebM.
7. **Testes** — commit `987a81a`: `run-all` exige MP4/H.264 e abre a aba II antes de baixar SRT/ASS; nova suíte `abas-e-previa.mjs` (10 checks, incluindo `ffprobe` do MP4).
8. **FAQ** — commit `334633d`: busca, categorias e expandir/recolher estavam sem handler; `src/ui/faq.js`.
9. **Auditoria final.** Varredura de elementos com `id` sem referência no JS: restaram só `#brandHome` (âncora nativa). Verificado no navegador: `.mov` carrega, vídeo vertical 720×1280, recarregar filme, X da análise cancela, setas do tablist trocam de aba, `#newFilmBtn` volta à landing, tema e configurações abrem.

## Pendências conhecidas

- MP4 do `MediaRecorder` é fragmentado (sem `faststart`, `moov` no fim) — ver `PENDENCIAS_PARA_O_USUARIO.md` §2.
- Timestamps do Whisper são por bloco, não por palavra.
- WebGPU é detectado, mas a inferência usa wasm/q8.
- `vendor/` (50 MB) não vai para o git; `INICIAR.bat` e `npm run vendor` regeneram.
