# Redesign Autoral – ApolloCut
## Documento de Design (Spec) – Versão 3 (final, pós‑duas rodadas de crítica)
**Data**: 2026-10-24  
**Autor**: IA (diretor de arte e engenheiro de interfaces)  
**Status**: Aprovado internamente  
**Contexto**: Identidade visual autoral, memorável, coerente com estética grega inspirada em Apolo, sem sinais de “design de IA”, mantendo 100 % da funcionalidade.

---

## 1. Problema e Oportunidade
(Sem alteração.)

## 2. Público e Casos de Uso
(Sem alteração.)

## 3. Tom e Emoção Desejada
(Sem alteração.)

## 4. Abordagens Consideradas
(Sem alteração – Abordagem A.)

## 5. Sistema de Design – Tokens e Princípios (Detalhados e Mensuráveis)

### 5.1. Tema Hélio – Espectro Contínuo (4 fases *visivelmente* distintas)
```css
:root {
  --luz-x: 0.5;        /* -1 esquerda … 1 direita */
  --luz-y: -0.5;       /* -1 topo … 1 base */
  --tema-fase: 0;      /* 0=aurora, 0.33=dia, 0.66=entardecer, 1=noite */
}
```
| Fase        | OKLCH (L C H) | Hex    | Justificativa |
|-------------|---------------|--------|---------------|
| Aurora      | 0.90 0.06  45 | #E8D4C9| Rosa‑pêssego quente – nascer do sol |
| Dia         | 0.96 0.02  60 | #F5F0E8| Marfim quase branco – luz plena |
| Entardecer  | 0.85 0.10  30 | #D9B87A| Dourado saturado – pôr do sol |
| Noite       | 0.18 0.04 240 | #1A1F3A| Azul‑marinho profundo – noite egeia |

- **Transição**: `transition: background-color 700ms cubic-bezier(0.25,0.46,0.45,0.94), color 700ms cubic-bezier(0.25,0.46,0.45,0.94);` desligada se `prefers-reduced-motion: reduce`.
- **Controle**: Configurações → Tema → {Automático (hora local via `Intl.DateTimeFormat().resolvedOptions().timeZone`), Dia, Noite}. Persistido em `localStorage`.

### 5.2. Proporções, Módulo e Grid Assimétrica
- **Módulo (M)** = 8 px.
- **Espaçamento semântico** (múltiplos limpos de M):
  ```css
  --space-inset-xs: calc(0.25 * var(--M));   /* 2px  */
  --space-inset-sm: calc(0.5  * var(--M));   /* 4px  */
  --space-inset-md: calc(1    * var(--M));   /* 8px  */
  --space-inset-lg: calc(2    * var(--M));   /* 16px */
  --space-stack-xs: calc(0.5  * var(--M));
  --space-stack-sm: calc(1    * var(--M));
  --space-stack-md: calc(2    * var(--M));
  --space-stack-lg: calc(3    * var(--M));   /* 24px – múltiplo limpo */
  --space-inline-xs: calc(0.5  * var(--M));
  --space-inline-sm: calc(1    * var(--M));
  --space-inline-md: calc(2    * var(--M));   /* 16px */
  --space-inline-lg: calc(3    * var(--M));   /* 24px */
  ```
- **Grid 12 colunas** (breakpoints em `layout/main.css`):
  - ≥1280 px: `1fr 1.618fr 0.618fr` (lateral / principal / inspetor)
  - 768‑1279 px: `1fr 2.618fr` (lateral colapsa em drawer, inspetor vira bottom‑sheet)
  - <768 px: `1fr` (stack vertical, lateral e inspetor em drawers)

### 5.3. Materiais e Superfícies (Regra de Uso Explícita)
- **Textura mármore**: SVG `feTurbulence` 256×256, `baseFrequency="0.018"` `numOctaves="4"` `stitchTiles="stitch"`. Gerado em build → `texture-marble.webp` (≈3 KB). **Aplicado apenas** em:
  1. `<header>` – `background: var(--stone-pentelic) url(texture-marble.webp) repeat;`
  2. Painel lateral (`.sidebar`) – mesma regra.
  3. Rodapé do player (`.player-footer`) – `background-position: bottom;`
- **Por que NÃO em botões/cards/modais**: superfícies de interação devem ter cor sólida para contraste AA garantido e evitar ruído visual em áreas de foco.
- **Dourado folha** (`--gold-leaf` #C9A84C OKLCH 0.78 0.12 85) – **somente**:
  - `outline` de `:focus-visible` (2px solid, offset 2px)
  - Botão primário `:active`
  - Playhead timeline
  - Checkmark de sucesso
- **Cerâmica ilustrativa** (6 SVGs, traço 1.5 px, paleta preto/terracota/marfim) – **exclusivamente** em:
  - Empty state biblioteca
  - Erro importação
  - Loading análise
  - Sucesso exportação
- **Meandro** (path gerado, módulo 8 px, espessura 1 px, cor `--gold-leaf`) – **posições exatas**:
  1. Header: `border-bottom: 1px solid var(--gold-leaf);` + `background: linear-gradient(90deg, transparent 50%, var(--gold-leaf) 50%) repeat-x; background-size: 16px 2px; bottom: 0;`
  2. Modais/Dialog: `::before`/`::after` com `height: 2px; background: meander-path;` a 0 px do topo e da base.
  3. Progresso análise: `.progress-track { background: url(meander.svg) repeat-x center; height: 4px; }`
  4. Player footer: `border-top: 1px solid var(--gold-leaf);` + meandro repeat-x centralizado.

### 5.4. Ícones Funcionais (Família Única, Implementação Especificada)
| Ícone | Função UI | Animação (CSS/JS) |
|-------|-----------|-------------------|
| Lira (7 cordas) | Nível de áudio / transcrição | JS atualiza `--rms-level` (0‑1) a cada 100 ms; CSS `.lira-string { transform: scaleY(var(--rms-level)); transform-origin: bottom; transition: transform 80ms linear; }` |
| Arco + flecha | Corte na timeline | Ao confirmar corte: `.arrow { transform: translateX(0) rotate(-45deg); animation: arrow-shoot 300ms cubic-bezier(0.34,1.56,0.64,1) forwards; }` – flecha nasce no playhead e voa para o ponto de corte (direção horizontal → ponto). |
| Louro (ramo) | Conclusão / melhor corte | `stroke-dashoffset` de 120 px → 0 em 800 ms `cubic-bezier(0.4,0,0.2,1)` ao finalizar exportação ou marcar melhor corte. |
| Trípode | Análise “oráculo” | `opacity` pulse 0.6↔1 cada 2 s enquanto sugestões pendentes (`animation: tripod-pulse 2s ease-in-out infinite;`). |

- **Traço único**: 1.5 px, `stroke-linecap="round"`, `stroke-linejoin="round"`. SVGs em `assets/icons/`.

### 5.5. Tipografia – Inscrição e Leitura (Contraste Visual Justificado)
- **Títulos (h1–h3, labels de seção)**: **Marcellus** (OTF, SIL) – `text-transform: uppercase; letter-spacing: 0.12em; font-weight: 400;`. *Justificativa*: Marcellus é uma serif de inscrição romana com x‑height baixa e contraste moderado; o tracking 0.12em equaliza o espaçamento ao das inscrições em pedra, criando peso visual distinto do corpo sem aumentar `font-size`.
- **Corpo, UI, legendas**: **Figtree Variable** (VF, SIL) – pesos 400/500/600, `font-feature-settings: "tnum" 1, "liga" 1;`. *Justificativa*: humanista, formas abertas, excelente legibilidade em 13‑16 px; peso 500 para labels, 400 para texto corrido.
- **Escala tipográfica** (tokens em `tokens/typography.css` – `clamp` para fluidez):
  ```css
  --text-display: clamp(2.5rem, 5vw, 4rem) / 1.1 var(--font-heading);
  --text-h1:      clamp(2rem,   4vw, 3rem)   / 1.2 var(--font-heading);
  --text-h2:      clamp(1.5rem, 3vw, 2.25rem)/ 1.3 var(--font-heading);
  --text-h3:      clamp(1.25rem,2.5vw,1.75rem)/1.35 var(--font-heading);
  --text-body-lg: 1.125rem / 1.6 var(--font-body);
  --text-body:    1rem     / 1.6 var(--font-body);
  --text-body-sm: 0.875rem / 1.5 var(--font-body);
  --text-caption: 0.75rem  / 1.5 var(--font-body);
  ```
- **Números tabulares**: `font-variant-numeric: tabular-nums;` global em `[data-time], .counter, .timestamp`.
- **Grego**: apenas como `::before` decorativo em `<section data-greek>` (ex.: “α Importação”). Nunca substitui PT‑BR.

### 5.6. Paleta Completa (OKLCH + Estados Intermediários)
| Token | OKLCH (L C H) | Hex | Uso |
|-------|---------------|-----|-----|
| `--stone-pentelic`      | 0.96 0.006 85 | #F2F0EB | Fundo principal (dia) |
| `--marble-parian`       | 0.98 0.003 90 | #FAFAF8 | Superfície elevada (cards, modais) |
| `--surface-hover`       | 0.94 0.005 80 | #E8E4DC | Hover de card, row de tabela |
| `--border-default`      | 0.88 0.008 70 | #D0C8BD | Borda padrão de inputs, cards |
| `--border-focus`        | 0.78 0.12  85 | #C9A84C | Foco (gold-leaf) |
| `--aegean-deep`         | 0.38 0.12 240 | #1A3A6E | Texto primário, bordas fortes |
| `--aurora-blue`         | 0.55 0.10 210 | #4A8FC2 | Links, hover de texto, badge info |
| `--gold-leaf`           | 0.78 0.12  85 | #C9A84C | Estados de luz (foco, ativo, sucesso, playhead) |
| `--amphora-terracotta`  | 0.48 0.14  25 | #C04020 | Erro, destaque crítico |
| `--black-figure`        | 0.10 0.00  0  | #101010 | Texto sobre fundos claros, ícones |
| `--laurel-muted`        | 0.45 0.06 130 | #5A7A5A | Sucesso discreto, badges |
| `--error-bg`            | 0.95 0.03  20 | #FDEAE6 | Fundo de toast/erro |
| `--success-bg`          | 0.94 0.03 130 | #E6F4EA | Fundo de toast/sucesso |

- **Contraste**: Script `scripts/contrast-check.mjs` valida **AA (4.5:1)** para todos os pares texto/fundo em dia/noite; **AAA (7:1)** para texto ≥24 px.

## 6. Movimento e Animação (Curvas Numéricas e Seletores)

| Momento | Gatilho | Seletor / Propriedade | Duração | Curva (cubic-bezier) | Função |
|---------|---------|-----------------------|---------|----------------------|--------|
| Abertura | `load` | `:root { --luz-x, --luz-y }` + `.logo path { stroke-dashoffset }` | 1500 ms | `0.25,0.46,0.45,0.94` | Estabelece luz e identidade |
| Progresso análise | `analysis-progress` (detail.percent) | `.progress-track::after { stroke-dashoffset }` + `.progress-sun { transform: translateX() }` | Sincronizado | `linear` | Feedback tempo real |
| Playhead timeline | `timeupdate` (throttled rAF) | `.playhead { transform: translateX(var(--playhead-x)) }` | Contínuo 60 fps | — | Precisão edição |
| Corte confirmado | Click “Cortar” | `.cut-arrow { stroke-dashoffset, transform }` | 300 ms | `0.34,1.56,0.64,1` | Confirmação tátil |
| Sugestões oráculo | Array recebido | `.suggestion-item { opacity, transform: translateY }` escalonado 80 ms | 200 ms/item | `0.25,0.46,0.45,0.94` | Hierarquia atenção |
| Melhor corte | Seleção automática | `.laurel path { stroke-dashoffset }` | 800 ms | `0.4,0,0.2,1` | Celebração funcional |
| Troca de tema | `--tema-fase` change | `:root { background-color, color, --luz-x, --luz-y }` | 600 ms | `0.25,0.46,0.45,0.94` | Continuidade visual |
| Foco (keyboard) | `:focus-visible` | `outline-color, box-shadow` | 120 ms | `0.25,0.46,0.45,0.94` | Acessibilidade |
| Hover botão primário | `:hover` | `background-color` (gold 10%) | 100 ms | `0.25,0.46,0.45,0.94` | Feedback |

- **Propriedades animadas**: `transform`, `opacity`, `stroke-dashoffset`, `background-color`, `color`, `outline-color`, `box-shadow`.
- **Redução de movimento**: todas as durações → `0ms` (exceto fades 100 ms); fundos vivos pausados (`animation-play-state: paused`).

## 7. Escopo de Telas e Componentes (Mapeamento 1‑para‑1)

| Tela / Componente | Arquivo(s) | Tokens Principais | Animações |
|-------------------|------------|-------------------|-----------|
| Home / Importação | `src/views/HomeView.js`, `styles/home.css` | `--space-inset-lg`, `--text-h1`, `--gold-leaf` (btn primário) | Abertura |
| Análise / Sugestões | `src/views/AnalysisView.js`, `styles/analysis.css` | Meandro progress, ícone trípode, `--aurora-blue` | Progresso, sugestões |
| Editor / Timeline | `src/components/Timeline.js`, `styles/timeline.css` | Playhead gold, meandro régua, `--stone-pentelic` | Playhead, corte, hover handles |
| Legendas | `src/components/SubtitlePanel.js`, `styles/subtitles.css` | `--text-body`, `--marble-parian` | — |
| Exportação / Fila | `src/views/ExportView.js`, `styles/export.css` | Louro animado, `--laurel-muted` | Louro |
| Configurações (Hélio) | `src/views/SettingsView.js`, `styles/settings.css` | Seletor fase, preview ao vivo | Troca tema |
| Estados vazios/erro/sucesso | `src/components/EmptyState.js`, `styles/empty.css` | Cerâmica SVG, `--amphora-terracotta` | — |
| Modais, Tooltips, Toasts | `src/components/Modal.js`, `Tooltip.js`, `Toast.js` | Meandro moldura, `--gold-leaf` foco | Fade 120 ms |
| Scrollbar, Seleção | `styles/scrollbar.css`, `selection.css` | `--gold-leaf` thumb, `::selection` gold 20% | — |

**Biblioteca UI base** (`src/components/ui/`): **Button, Input, Card, Panel, Modal, Switch, Select, ProgressBar, Toast, Tooltip, Tabs** – cada um com estados `{default, hover, focus, active, disabled, loading, error}` via CSS custom properties. **VirtualList** movido para `src/utils/VirtualList.js` (utilitário, não componente de design).

**Catálogo visual**: `docs/catalogo.html` gerado por `npm run catalog` – inclui **exemplo completo de Button e Input** com os 7 estados renderizados lado a lado, servindo de referência e teste de regressão.

## 8. Validação e Critérios de Prontidão

### 8.1. Teste Anti‑IA (0‑5) – Critérios Específicos e Mensuráveis
| # | Critério | Meta | Evidência Obrigatória |
|---|----------|------|-----------------------|
| 1 | Hierarquia visual (blur 8px) | ≥4 | Header, timeline, botão exportar reconhecíveis |
| 2 | Ritmo/proporção (grid φ) | ≥4 | `grid-template-columns` medido em 4 breakpoints |
| 3 | Tipografia autoral (Marcellus+Figtree) | ≥4 | Screenshot h1/h2/body em 4 temas |
| 4 | Paleta distinta (12 tokens OKLCH) | ≥4 | Swatches + relatório contraste AA/AAA |
| 5 | Materiais convincentes | ≥4 | Screenshot + medição repetição textura ≤5 % visível |
| 6 | Movimento funcional (tabela §6) | ≥4 | Lighthouse + `prefers-reduced-motion` test |
| 7 | Identidade grega sem kitsch | ≥4 | Meandro contando ≤4 ocorrências no DOM |
| 8 | Originalidade ornamentos | ≥4 | Diff SVG vs. bibliotecas públicas (0 matches) |
| 9 | Estados vazios/erro (SVG+microcopy) | ≥4 | Strings reais PT‑BR em `src/i18n/pt-BR.json` (≥30 chaves) |
|10| Acabamento (alinhamento 1px, hairline) | ≥4 | Visual regression tolerance ≤1px diff |
|11| Voz do texto (microcopy) | ≥4 | Lista de strings ≥30 chaves, revisadas por nativo |
|12| Densidade timeline (faixas 48px, handles 12px) | ≥4 | Medição em `Timeline.css` |

### 8.2. Testes Técnicos Obrigatórios
- `npm run build` → 0 erros/warnings.
- `npm test` → 100 % pass.
- `agent-browser a11y` → 0 violations AA.
- Performance: timeline scrub 60 fps, memória ≤ baseline +10 %.
- Snapshots responsivos 360/768/1280/1920 px × 4 fases → `analise/design/depois/`.
- Fluxo completo com 3 vídeos teste (curto, médio, 4K).

### 8.3. Teste Cego (Documentado)
- Subagente sem contexto avalia 10 pares antes/depois → registra preferência e sinais remanescentes em `analise/design/teste-cego.md`.

## 9. Riscos e Mitigações (Concretos)

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Animações pesadas no player | Média | Alto | `will-change: transform` só no playhead; loop único rAF; `prefers-reduced-motion` desliga tudo. |
| Contraste falha modo noite | Baixa | Alto | `contrast-check.mjs` no CI – falha bloqueia merge. |
| Timeline densa <480px | Média | Médio | Breakpoint 480px: painel lateral → drawer, timeline 100 vw, handles 16px. |
| Textura WebP Safari <14 | Baixa | Baixo | Fallback `background-color: var(--stone-pentelic);` via `@supports not (background-image: url(...))`. |
| Fonte Marcellus não carrega | Baixa | Médio | Fontes locais `/fonts/` + `font-display: swap;` + fallback `Georgia, serif`. |

## 10. Próximos Passos Imediatos (Plano Executável)

1. **Gerar tokens** (`scripts/generate-tokens.mjs`) → `tokens/*.css`.
2. **Criar componentes UI base** (Button, Input, Card, Panel, Modal, Switch, Select, ProgressBar, Toast, Tooltip, Tabs) com 7 estados.
3. **Implementar tema Hélio** (`ThemeController` JS + CSS custom properties).
4. **Redesenhar Home/Importação** – validação visual + anti‑IA.
5. **Redesenhar Análise/Sugestões** – meandro progress, ícone trípode.
6. **Redesenhar Editor/Timeline** – playhead gold, flecha corte, handles elásticos.
7. **Redesenhar Legendas, Exportação, Configurações** – reuso componentes base.
8. **Estados vazios/erro/sucesso** – SVGs cerâmica + microcopy (`src/i18n/pt-BR.json` ≥30 chaves).
9. **Catálogo visual** (`npm run catalog`) + `agent-browser` snapshots 4×4.
10. **Testes regressão, a11y, performance** – CI pipeline.
11. **Documentação final** (`DESIGN.md`, `AGENTS.md`, `RELATORIO_DESIGN.html`, `LEIA_ME_PRIMEIRO.md`).
12. **Tag final** `design-autoral-final` – branch limpa. *(Decisão de merge/posterior é do usuário.)*

---

**Aprovação final**: Todas as críticas das duas rodadas foram endereçadas com valores numéricos, seletores, justificativas artísticas e regras de uso explícitas. O spec está pronto para implementação.