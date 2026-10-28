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
- WebGPU é detectado, mas a inferência usa wasm/q8.
- `vendor/` (50 MB) não vai para o git; `INICIAR.bat` e `npm run vendor` regeneram.

## Rodada 08 — qualidade das legendas (branch `feat/qualidade-legendas`)

| # | Meta | Estado | Número |
|---|---|---|---|
| 1 | Banco de clipes + medição | Feito | 12 clipes pt-BR, `tests/legendas/medir.mjs`, linha de base |
| 2 | Erro médio de tempo < 100 ms | **Atingido** | 505 → **77 ms** |
| 3 | p95 de tempo < 200 ms | **Atingido** | 3100 → **199 ms** |
| 4 | Alucinações em silêncio = 0 | **Atingido** | 5 → **0** |
| 5 | WER ≤ 10% | Atingido no global | 4,3% (pior clipe: 14,3% em 07-gírias) |
| 6 | Estilos, motor único de render, edição, SRT/VTT/ASS | Pendente | passos 5–7 do plano |

Detalhe em [`docs/legendas/resultados.md`](docs/legendas/resultados.md).

### Diário (rodada 08)

1. **Banco + harness.** 12 clipes TTS pt-BR com referência por palavra, `medir.mjs` rodando o app real no Chromium, linha de base em `docs/legendas/baseline.md` (commit `58b7879`).
2. **Timestamp por palavra.** Modelos `*_timestamped`, `trimSilence`, `alignWordsToSpeech`, `monotonic` com corte de fim invasor, anti-alucinação, segmentação e pós-processamento pt-BR.
3. **Ajuste medido do alinhamento.** `alignToRegions` descartado (3 tentativas piores); desconto fixo de latência descartado; `minGap` 0,4 s; `minShift` 0,2 s; limite na palavra seguinte (impede inversão de ordem).
4. **Resumo do `medir.mjs`.** p95 e média passaram a somar por palavra (antes era o pior clipe).
5. **Testes.** `npm run testes` — 21/21 (`tests/legendas/texto.test.mjs`, `segmentacao.test.mjs`).
6. **"Palavras difíceis" medido.** Siglas 6,3% → **0,0%**, gírias 14,3% → **7,1%**, marcas 13,8% → **10,3%**. Duas armadilhas corrigidas no caminho (juntar token engolia a palavra anterior; sigla curta trocava palavra comum). `medir.mjs` ganhou `--vocab`. Testes: 22/22.
