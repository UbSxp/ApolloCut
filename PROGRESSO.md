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
| 6 | Motor único, estilos, arraste/alça, auto-fit | **Feito** | commit `22afcfa` — render.js, captions.js, 5 estilos, canvas, safe-area |
| 7 | Edição texto/tempo, desfazer/refazer, SRT/VTT/ASS, vídeo queimado | **Feito** | commit `ea14aff` — split/merge, atalhos, find/replace, VTT, onlyCaptions |
| 8 | Auditoria automática, docs, relatório final | **Feito** | commit `8e5cde7` — auditar.mjs no CI, COMO_FUNCIONA.md, relatorio-legendas.html, LEIA_ME_PRIMEIRO.md |

Detalhe em [`docs/legendas/resultados.md`](docs/legendas/resultados.md).

### Diário (rodada 08)

1. **Banco + harness.** 12 clipes TTS pt-BR com referência por palavra, `medir.mjs` rodando o app real no Chromium, linha de base em `docs/legendas/baseline.md` (commit `58b7879`).
2. **Timestamp por palavra.** Modelos `*_timestamped`, `trimSilence`, `alignWordsToSpeech`, `monotonic` com corte de fim invasor, anti-alucinação, segmentação e pós-processamento pt-BR.
3. **Ajuste medido do alinhamento.** `alignToRegions` descartado (3 tentativas piores); desconto fixo de latência descartado; `minGap` 0,4 s; `minShift` 0,2 s; limite na palavra seguinte (impede inversão de ordem).
4. **Resumo do `medir.mjs`.** p95 e média passaram a somar por palavra (antes era o pior clipe).
5. **Testes.** `npm run testes` — 21/21 (`tests/legendas/texto.test.mjs`, `segmentacao.test.mjs`).
6. **"Palavras difíceis" medido.** Siglas 6,3% → **0,0%**, gírias 14,3% → **7,1%**, marcas 13,8% → **10,3%**. Duas armadilhas corrigidas no caminho (juntar token engolia a palavra anterior; sigla curta trocava palavra comum). `medir.mjs` ganhou `--vocab`. Testes: 22/22.
7. **Motor único + estilos + arraste/alça + auto-fit.** `src/captions/render.js` desenha na prévia (canvas) e na exportação; 5 presets (Clássico/Impacto/Karaokê/Mínimo/Hélio) com chaves antigas preservadas; `setupCaptionDrag()` em `src/ui/captions.js` — arraste move `captionPos {x,y}`, alça no canto inf-dir escala `captionScale`, área segura acende durante interação; auto-ajuste de tamanho até caber (`ajustarTamanho`); labels de estilo atualizadas no HTML. Commits: `22afcfa`. `npm run testes` 22/22, `npm run auditoria` 14/14, `npm run fumaca` 10/10, capturas de 5 estilos × 2 temas geradas em `docs/evidencias/legendas/`.
8. **Edição completa + exportação VTT + só legendas.** `setupCueEditor()`: snapshotCues antes de editar, botões split/merge (⎘/⎯), find/replace com highlight de ocorrências; `setupShortcuts()`: Ctrl+Z/Shift+Z undo/redo, Enter divide, Shift+Backspace junta, ArrowUp/Down ajusta tempo ±0,1s, ArrowLeft/Right seek ±0,5s; `splitCue()` divide palavras proporcionalmente ao tempo do cursor; `mergeCue()` junta com próximo; `exportSubtitles('vtt')` gera WEBVTT; `export.js`: opção "só legendas" → canvas alpha=true, WebM/VP9, sem áudio, fundo transparente. Commits: `ea14aff`. `npm run testes` 22/22, `npm run auditoria` 14/14, `npm run fumaca` 10/10.
9. **Auditoria automática + documentação final.** `tests/legendas/auditar.mjs` valida thresholds (WER≤10%, CER≤5%, tempo médio≤100ms, p95≤200ms, alucinações=0, perdidas≤5/clip) e roda no `npm run auditoria`; `docs/legendas/COMO_FUNCIONA.md` documenta pipeline completo; `docs/relatorio-legendas.html` mostra 5 estilos × 2 temas com capturas auto-geradas; `LEIA_ME_PRIMEIRO.md` resume mudanças, tabela antes/depois, guia rápido/preciso, como rodar medir/auditoria, pendências. Commit: `8e5cde7`. `npm run testes` 22/22, `npm run auditoria` (E2E + auditar) ✅, `npm run fumaca` 10/10.

## Rodada 09 — fala perdida + download + seleção (2026-10-29)

Relato do usuário no vídeo real: legenda não correspondia à fala, "Baixar corte" não baixava e o texto da interface era selecionável por acidente.

| # | Correção | Estado |
|---|---|---|
| 1 | Janelas próprias de 28 s (fim do `chunk_length_s`/`stride`) | Feito — `src/ui/whisper-worker.js` |
| 2 | Emenda por texto entre janelas (`juntarSobreposicao`) | Feito |
| 3 | `monotonic` corta o fim na duração do corte | Feito — `src/captions/words.js` |
| 4 | "105, 67" não vira "105, 67" com pausa | Feito — `src/captions/normalize.js` |
| 5 | `auto` = `small` até 90 s, `base` acima | Feito — `src/captions/models.js` |
| 6 | Download via `POST /salvar` (o navegador embutido entrega 0 byte acima de ~5 MB) | Feito — `tools/servir.mjs` + `src/ui/export.js` |
| 7 | Seleção de texto só em campos, logs e `.selectable` | Feito — `styles.css` |

- **Medição** (`npm run medir -- --label janelas`): WER 4,3% → **2,0%**, CER 1,2% → **1,1%**, erro médio 77 → **70 ms**, p95 199 → **177 ms**, alucinações 0, perdidas 2, custo 18 067 → 45 150 ms/min. `12-longo` 6,9% → **0,0%**; `07-girias` 14,3% → 17,9% (sem vocabulário).
- **Vídeo real do usuário** (35 s): 53 → **88 palavras**, último bloco 55,7 s → **39,96 s** (corte termina em 40,72 s).
- **Download**: causa medida no navegador embutido — blobs de 1 MB e 4 MB concluem, 8 MB e o corte de 10,8 MB chegam com 0 byte. "Baixar corte" agora grava em `~/Downloads` via `POST /salvar` (`tools/servir.mjs`); a suíte E2E copia `state.export.savedPath` em vez de esperar o evento `download`.
- `npm run testes` 24/24, `npm run teste` 14/14, `npm run fumaca` 10/10. Detalhe em `docs/legendas/resultados.md` (Rodada 3).
