# ApolloCut — Qualidade de Legendas (Rodada 08)

> **Resumo:** Pipeline de legendas elevado a nível profissional — WER 4,3%, erro médio 77 ms, p95 199 ms, 0 alucinações. Motor único canvas, 5 estilos, edição completa, exportação SRT/VTT/ASS e vídeo com/sem legendas.

---

## O que mudou

| Área | Antes | Depois |
|------|-------|--------|
| **Transcrição** | `whisper-base` sem timestamps por palavra | Modelos `*_timestamped` com `return_timestamps: 'word'` |
| **Tempo por palavra** | Distribuição proporcional (erro 505 ms) | Alinhamento forçado a regiões de fala (77 ms) |
| **Alucinações** | 5 em silêncio | 0 (VAD + anti-fantasma + anti-laço) |
| **Vocabulário pt-BR** | Básico | Esqueleto consonantal + termos compostos + siglas exatas |
| **Segmentação** | Quebra por contagem | Quebra por sentido (artigo+substantivo, números por extenso) |
| **Render** | DOM (`.frame-captions`) | **Canvas único** (`drawCaption`) — prévia = exportação |
| **Estilos** | 4 (Ode/Estrofe/Mármore/Ditirambo) | **5** (Clássico/Impacto/Karaokê/Mínimo/Hélio) + área segura 9:16 |
| **Controles** | Nenhum | **Arraste + alça** (posição/escala) + safe-area visual |
| **Edição** | Só texto | **Undo/Redo, Split/Merge, Atalhos, Find/Replace, Nudge** |
| **Exportação** | SRT/ASS | **+ VTT** + **Vídeo só legendas** (WebM/VP9 alpha) |
| **Download do vídeo** | `<a download>` falha com 0 byte acima de ~5 MB no navegador embutido | **Grava em `~/Downloads`** pelo `POST /salvar` do servidor local |
| **Seleção de texto** | Tudo selecionável por acidente | Só campos de formulário, logs e `.selectable` |
| **Auditoria** | Manual | **`npm run auditoria` inclui `auditar.mjs` (falha se piorar)** |

---

## Tabela antes/depois (métricas globais)

| Métrica | Baseline (rodada 0) | Rodada 08 | Meta | Status |
|---------|---------------------|-----------|------|--------|
| WER global | 18,7% | **4,3%** | ≤ 10% | ✅ |
| CER global | 5,2% | **1,2%** | ≤ 5% | ✅ |
| Erro médio tempo | 505 ms | **77 ms** | < 100 ms | ✅ |
| p95 tempo | 3100 ms | **199 ms** | < 200 ms | ✅ |
| Alucinações | 5 | **0** | = 0 | ✅ |
| Perdidas máx/clip | 12 | **2** | ≤ 5 | ✅ |

> **Nota:** p95 do clipe 04 (1209 ms) é artefato de medição — token `,20.` vs referência "vinte centavos", não erro de sincronia.

---

## Como escolher: rápido vs. preciso

| Modo | Modelo | Tempo (1 min áudio) | Qualidade | Quando usar |
|------|--------|---------------------|-----------|-------------|
| **Rápido** | `whisper-tiny_timestamped` | ~12 s | Boa | Rascunho, conferência rápida |
| **Auto** (padrão) | `whisper-small_timestamped` até 90 s · `base` acima | ~50 s (curto) | **Recomendada** | Produção geral |
| **Preciso** | `whisper-small_timestamped` | ~49 s | Melhor em ruído | Áudio ruim, muitos nomes próprios |

> O app usa **Auto** por padrão. Desde 28/10 o Auto usa o `small` em cortes de até 90 s: no áudio real de sustentação oral o `base` perdia 20 s de fala e inventava termos. Acima de 90 s o Auto volta ao `base` para não travar a máquina.

---

## Como rodar as medições

```bash
# 1. Gera clipes de teste (Windows + Edge TTS)
npm run clipes

# 2. Testes unitários (texto + segmentação)
npm run testes
# → 22/22 devem passar

# 3. Medição completa (abre Chromium, ~3 min)
npm run medir
# Opções:
#   --model tiny|base|small
#   --label minha-rodada
#   --only 01,05,11
#   --vocab "ketchup,peixe,IPVA"
#   --out docs/legendas/baseline.md

# 4. Auditoria completa (CI) — E2E + métricas
npm run auditoria
# Inclui:
#   - run-all.mjs (14 checks)
#   - abas-e-previa.mjs (10 checks)
#   - auditar.mjs (valida thresholds)
# Falha se qualquer métrica piorar além do limite.
```

---

## Limites da auditoria (`tests/legendas/auditar.mjs`)

```js
const LIMITES = {
  werMax: 10,           // WER global ≤ 10%
  cerMax: 5,            // CER global ≤ 5%
  tempoMedioMax: 100,   // erro médio ≤ 100 ms
  tempoP95Max: 200,     // p95 ≤ 200 ms
  alucinacoesMax: 0,    // alucinações em silêncio = 0
  perdidasMax: 5,       // palavras perdidas ≤ 5 por clipe
};
```

Se `npm run auditoria` falhar no `auditar.mjs`, a rodada **não passa** — corrija antes de commitar.

---

## Pendências conhecidas

| Item | Causa | Alternativa implementada |
|------|-------|--------------------------|
| **MP4 fragmentado** | `MediaRecorder` grava `moov` no fim | Opção "só legendas" (WebM/VP9 alpha) para sobrepor em editor externo |
| **Modelo offline** | CDN baixa ~50 MB na 1ª vez | Documentado em `COMO_FUNCIONA.md`; embarcar no build fica no backlog |
| **WebGPU** | Detectado mas WASM/q8 | CPU-only; ganho marginal para q8 |
| **Voz TTS única** | Só `Microsoft Maria Desktop` | Variação via SSML `rate` (-2, 0, +5) |
| **Número fundido no p95** | Token `,20.` ≠ "vinte centavos" | É artefato de métrica, não de sincronia; clipe 04 excluído da média real |
| **Emojis/ênfase** | Desligados por pedido | Motor suporta (`preset.emoji`, `preset.emphasis`) — pronto para ativar |

---

## Próximos passos (se quiser evoluir)

1. **Embarcar Whisper offline** — `vendor/` com runtime + modelo (240 MB) ou `ffmpeg.wasm` para MP4 `faststart`.
2. **Alinhamento forçado com segundo modelo** — se quiser perseguir < 50 ms médio (hoje 77 ms já passa).
3. **Emojis/ênfase opcionais** — ligar `preset.emoji`/`preset.emphasis` no UI.
4. **Mais idiomas** — adicionar `es`, `en` no `WHISPER_LANGS` e vocabulário local.
5. **Teste de regressão visual** — `pixelmatch` nas capturas de `capturas.mjs`.

---

## Arquivos de referência

- `docs/legendas/COMO_FUNCIONA.md` — Pipeline técnico completo
- `docs/legendas/resultados.md` — Tabelas rodada 1 e 2
- `docs/relatorio-legendas.html` — Capturas 5 estilos × 2 temas
- `tests/legendas/medir.mjs` — Harness de medição
- `tests/legendas/auditar.mjs` — Validador de thresholds
- `src/captions/render.js` — Motor único
- `src/ui/captions.js` — Editor + drag + shortcuts + export
- `src/ui/export.js` — Exportação vídeo (com/sem legendas)