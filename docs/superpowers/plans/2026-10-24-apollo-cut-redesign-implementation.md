# ApolloCut Redesign Autoral – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a interface do ApolloCut em identidade visual autoral, memorável e coerente com a estética grega inspirada em Apolo, eliminando sinais de “design de IA”, mantendo 100 % da funcionalidade existente.

**Architecture:** O app roda no navegador (HTML/CSS/JS puro). O redesign será feito por camadas: (1) tokens e utilitários, (2) biblioteca de componentes UI base, (3) controlador de tema Hélio, (4) redesign de cada tela/view, (5) estados vazios/erro/sucesso com ilustrações cerâmicas, (6) catálogo visual e testes de regressão visual/acessibilidade/performance.

**Tech Stack:** Node.js (scripts de build), HTML/CSS/JS (ES modules), Puppeteer para testes de UI, agent-browser para validação visual. Sem frameworks UI adicionais.

**Spec:** `docs/superpowers/specs/2026-10-24-apollo-cut-redesign-design.md`

## Global Constraints
- Não adicionar dependências npm além das já existentes (puppeteer-core).
- Todas as fontes servidas localmente (`/fonts/`).
- Nenhuma chamada a CDN, API paga ou telemetria.
- Contraste mínimo AA (4.5:1) em todos os pares texto/fundo, ambos os temas.
- Animações apenas em `transform`, `opacity`, `stroke-dashoffset`, `background-color`, `color`, `outline-color`, `box-shadow`.
- `prefers-reduced-motion` desliga animações (duração 0 ms ou fade 100 ms).
- Branch `design/autoral` isolada; worktrees para tarefas paralelas.
- Commits pequenos, build (`npm run check`) e testes (`npm run test:all`) passando a cada commit.
- Documentação em `docs/` atualizada ao final.

## Review Focus (5 classes de entrada/falha não cobertas diretamente por tarefas)
1. **Entrada de vídeo corrompido/ código não suportado** – player deve mostrar erro cerâmico e não travar.
2. **Mudança de fuso horário durante sessão** – tema Hélio deve recalcular fase sem recarregar página.
3. **Dispositivo sem GPU / prefers-reduced-motion + low-resource** – animações desligadas, texturas fallback sólidas.
4. **Navegação por teclado em modais aninhados** – foco trap correto, ordem lógica.
5. **Exportação de vídeo longo (>30 min) com legenda** – memória ≤ baseline +10 %, sem vazamento de blob URLs.

Cada item terá teste dedicado na tarefa correspondente (ver tarefas 8, 9, 10, 11, 12).

---

### Task 1: Gerar Tokens CSS e Assets Estáticos
**Files:**
- Create: `scripts/generate-tokens.mjs`
- Create: `tokens/theme.css`
- Create: `tokens/spacing.css`
- Create: `tokens/typography.css`
- Create: `tokens/colors.css`
- Create: `scripts/generate-texture.mjs` → `public/texture-marble.webp`
- Create: `scripts/meander.mjs` → `public/meander.svg`
- Create: `scripts/generate-icons.mjs` → `public/icons/*.svg` (lira, arco, louro, trípode)
- Test: `tests/tokens.test.js`

**Interfaces:**
- Produz: arquivos CSS em `tokens/` importáveis via `<link rel="stylesheet" href="/tokens/theme.css">` etc.; assets em `public/`.

- [ ] **Step 1: Write failing test** – verifica existência e valores esperados em `tokens/theme.css` (ex.: `--luz-x`, `--tema-fase`, 4 fases OKLCH).
- [ ] **Step 2: Run test** – `node tests/tokens.test.js` → FAIL.
- [ ] **Step 3: Implement `generate-tokens.mjs`** – lê spec (§5.1, §5.2, §5.5, §5.6) e escreve os 4 arquivos CSS + copia fontes para `/fonts/`.
- [ ] **Step 4: Implement `generate-texture.mjs`** – usa `canvas` + `feTurbulence` para gerar 256×256 WebP.
- [ ] **Step 5: Implement `meander.mjs`** – gera path SVG do meandro (módulo 8 px, espessura 1 px).
- [ ] **Step 6: Implement `generate-icons.mjs`** – escreve 4 SVGs com traço 1.5 px, `stroke-linecap="round"`.
- [ ] **Step 7: Run tests** – `node tests/tokens.test.js` → PASS.
- [ ] **Step 8: Commit**
```bash
git add scripts/generate-tokens.mjs scripts/generate-texture.mjs scripts/meander.mjs scripts/generate-icons.mjs tokens/ public/ tests/tokens.test.js
git commit -m "feat(tokens): generate design tokens, marble texture, meander, icons"
```

---

### Task 2: Biblioteca de Componentes UI Base
**Files:**
- Create: `src/components/ui/Button.js` + `styles/ui/button.css`
- Create: `src/components/ui/Input.js` + `styles/ui/input.css`
- Create: `src/components/ui/Card.js` + `styles/ui/card.css`
- Create: `src/components/ui/Panel.js` + `styles/ui/panel.css`
- Create: `src/components/ui/Modal.js` + `styles/ui/modal.css`
- Create: `src/components/ui/Switch.js` + `styles/ui/switch.css`
- Create: `src/components/ui/Select.js` + `styles/ui/select.css`
- Create: `src/components/ui/ProgressBar.js` + `styles/ui/progress.css`
- Create: `src/components/ui/Toast.js` + `styles/ui/toast.css`
- Create: `src/components/ui/Tooltip.js` + `styles/ui/tooltip.css`
- Create: `src/components/ui/Tabs.js` + `styles/ui/tabs.css`
- Test: `tests/ui-components.test.js`

**Interfaces:**
- Consome: `tokens/*.css` (via import CSS).
- Produz: classes ES exportadas (`Button`, `Input`, …) com métodos `render()`, `setState(state)`, `on(event, handler)`.

- [ ] **Step 1: Write failing test** – instancia `Button`, verifica 7 estados (default, hover, focus, active, disabled, loading, error) aplicam classes CSS corretas.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement cada componente** – HTML template + CSS usando custom properties (`--btn-bg`, `--btn-text`, `--btn-border`, etc.) mapeadas para tokens. Estados via `[data-state="..."]`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** (um commit por componente ou agrupado).
```bash
git add src/components/ui/ styles/ui/ tests/ui-components.test.js
git commit -m "feat(ui): base components Button Input Card Panel Modal Switch Select ProgressBar Toast Tooltip Tabs"
```

---

### Task 3: Theme Controller (Hélio)
**Files:**
- Create: `src/controllers/ThemeController.js`
- Modify: `index.html` (adicionar `<link rel="stylesheet" href="/tokens/theme.css">` etc.)
- Test: `tests/theme-controller.test.js`

**Interfaces:**
- Consome: `tokens/theme.css`, `tokens/colors.css`.
- Produz: instância global `window.themeController` com API:
  - `init()` – lê `localStorage`, define `--tema-fase` inicial.
  - `setMode('auto'|'day'|'night')` – persiste e aplica.
  - `updateByHour()` – chamado a cada minuto (setInterval 60s) quando modo auto.
  - Emite evento `themechange` com `{phase, isAuto}`.

- [ ] **Step 1: Write failing test** – verifica troca de fase atualiza variáveis CSS `--luz-x`, `--luz-y`, cores de fundo.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement `ThemeController`** – lógica de interpolação OKLCH entre 4 fases (valores do spec), transição 700 ms `cubic-bezier(0.25,0.46,0.45,0.94)`, respeita `prefers-reduced-motion`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/controllers/ThemeController.js index.html tests/theme-controller.test.js
git commit -m "feat(theme): Hélio theme controller with auto/day/night modes"
```

---

### Task 4: Redesenhar Home / Importação
**Files:**
- Modify: `src/views/HomeView.js`
- Modify: `styles/home.css`
- Test: `tests/home-view.test.js`

**Interfaces:**
- Consome: componentes `Button`, `Input` (arrastar soltar), `Panel`, `Toast`; `ThemeController`.
- Produz: view com header (meandro base), área de dropzone, botão primário “Importar”, toast de feedback.

- [ ] **Step 1: Write failing test** – renderiza `HomeView`, verifica presença de meandro no header, botão primário com `--gold-leaf` focus, dropzone acessível.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement `HomeView`** – usa componentes base, aplica tokens de espaçamento (`--space-inset-lg`), tipografia (`--text-h1` Marcellus), animação de abertura (Task 9).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/views/HomeView.js styles/home.css tests/home-view.test.js
git commit -m "feat(home): redesign import screen with meandro header and gold-leaf primary button"
```

---

### Task 5: Redesenhar Análise / Sugestões
**Files:**
- Modify: `src/views/AnalysisView.js`
- Modify: `styles/analysis.css`
- Test: `tests/analysis-view.test.js`

**Interfaces:**
- Consome: `ProgressBar` (meandro), ícone `trípode`, `Card` para sugestões, `Toast`.
- Produz: view com trilha de progresso meandro, sol animado, lista de sugestões (ícone trípode pulse), destaque “melhor corte” com louro animado.

- [ ] **Step 1: Write failing test** – verifica progress bar usa meandro SVG, sugestões renderizam com ícone trípode, melhor corte recebe louro animado.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement `AnalysisView`** – integra `ThemeController`, animação progresso sincronizada com evento `analysis-progress` (detail.percent), sugestões escalonadas 80 ms.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/views/AnalysisView.js styles/analysis.css tests/analysis-view.test.js
git commit -m "feat(analysis): meander progress track, tripod icon, laurel for best cut"
```

---

### Task 6: Redesenhar Editor / Timeline
**Files:**
- Modify: `src/components/Timeline.js`
- Modify: `styles/timeline.css`
- Test: `tests/timeline.test.js`

**Interfaces:**
- Consome: `ProgressBar` (playhead), ícones `lira`, `arco`, `louro`, `Panel` para controles.
- Produz: timeline com playhead fio dourado + sol, handles elásticos, corte dispara flecha, áudio visualizado via lira pulando (RMS).

- [ ] **Step 1: Write failing test** – playhead move suavemente (`requestAnimationFrame`), corte cria flecha animada, lira escala Y conforme `--rms-level`.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement `Timeline`** – playhead `transform: translateX(var(--playhead-x))`; corte dispara `arrow-shoot` 300 ms `cubic-bezier(0.34,1.56,0.64,1)`; handles com `transition: transform 120ms cubic-bezier(0.25,0.46,0.45,0.94)` (elastic feel). JS atualiza `--rms-level` a cada 100 ms.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/Timeline.js styles/timeline.css tests/timeline.test.js
git commit -m "feat(timeline): gold playhead, arrow cut, elastic handles, lira audio viz"
```

---

### Task 7: Redesenhar Legendas, Exportação, Configurações
**Files:**
- Modify: `src/components/SubtitlePanel.js` + `styles/subtitles.css`
- Modify: `src/views/ExportView.js` + `styles/export.css`
- Modify: `src/views/SettingsView.js` + `styles/settings.css`
- Test: `tests/subtitles-export-settings.test.js`

**Interfaces:**
- Consome: componentes base, `ThemeController`, ícones.
- Produz: painel legendas (estilo/preview), fila exportação com louro animado ao finalizar, configurações com seletor de fase Hélio (preview ao vivo).

- [ ] **Step 1: Write failing test** – cada view renderiza sem erros, seletor de tema atualiza variáveis CSS em tempo real, exportação dispara louro.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement views** – reutiliza `Tabs`, `Select`, `Switch`, `ProgressBar`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/SubtitlePanel.js src/views/ExportView.js src/views/SettingsView.js styles/subtitles.css styles/export.css styles/settings.css tests/subtitles-export-settings.test.js
git commit -m "feat(subtitles/export/settings): redesign with base components and live theme preview"
```

---

### Task 8: Estados Vazios, Erro, Sucesso (Ilustrações Cerâmicas)
**Files:**
- Create: `src/components/EmptyState.js` + `styles/empty.css`
- Create: `public/illustrations/*.svg` (6 SVGs: arqueiro, citarista, atleta, coro, trípode, ánfora)
- Test: `tests/empty-error-success.test.js`

**Interfaces:**
- Consome: ilustrações SVGs, tokens de cor (`--amphora-terracotta`, `--black-figure`, `--marble-parian`).
- Produz: componente `EmptyState` com props `{type: 'empty'|'error'|'loading'|'success', messageKey}`.

- [ ] **Step 1: Write failing test** – `EmptyState` renderiza SVG correto para cada tipo, microcopy vem de `src/i18n/pt-BR.json`.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement `EmptyState`** – usa ilustração adequada, aplica `--amphora-terracotta` para erro, `--laurel-muted` para sucesso.
- [ ] **Step 3b: Criar `src/i18n/pt-BR.json`** com ≥30 chaves (ex.: `empty.library`, `error.import`, `loading.analysis`, `success.export`, `toast.cutDone`, etc.).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/EmptyState.js styles/empty.css public/illustrations/ src/i18n/pt-BR.json tests/empty-error-success.test.js
git commit -m "feat(empty): ceramic illustrations for empty/error/loading/success states with PT-BR microcopy"
```

---

### Task 9: Animação de Abertura (Amanhecer) + Catálogo Visual
**Files:**
- Modify: `src/app.js` (bootstrap abre `HomeView` com animação)
- Create: `scripts/catalog.mjs` → `docs/catalogo.html`
- Test: `tests/opening-animation.test.js` (Puppeteer)

**Interfaces:**
- Consome: `ThemeController`, `HomeView`, logotipo SVG.
- Produz: animação 1.5 s (pulável), catálogo HTML com todos componentes em 7 estados.

- [ ] **Step 1: Write failing test** – Puppeteer carrega `index.html`, verifica animação de abertura (variáveis `--luz-x/--luz-y` mudam, logo desenha via `stroke-dashoffset`), catálogo gera HTML válido.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement animação abertura** – em `app.js` `init()` chama `themeController.animateDawn()` (1.5 s, `cubic-bezier(0.25,0.46,0.45,0.94)`), pulável via clique ou `prefers-reduced-motion`.
- [ ] **Step 4: Implement `catalog.mjs`** – importa todos componentes UI, renderiza grid de estados, injeta CSS tokens.
- [ ] **Step 5: Run tests** → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/app.js scripts/catalog.mjs docs/catalogo.html tests/opening-animation.test.js
git commit -m "feat(opening): dawn animation 1.5s skippable; catalog visual generator"
```

---

### Task 10: Testes de Regressão Visual, Acessibilidade, Performance
**Files:**
- Create: `tests/visual-regression.test.js` (agent-browser + Puppeteer)
- Create: `tests/accessibility.test.js` (axe-core via agent-browser)
- Create: `tests/performance.test.js` (memory/GPU baseline)
- Modify: `package.json` (scripts `test:visual`, `test:a11y`, `test:perf`)

**Interfaces:**
- Consome: build final, `agent-browser` CLI, `puppeteer-core`.
- Produz: relatórios em `analise/design/depois/`, métricas JSON.

- [ ] **Step 1: Write failing test** – visual: captura 4 larguras × 4 fases (16 PNGs) comparadas com baseline `analise/design/antes/` (diff ≤1 px). A11y: 0 violações AA. Perf: timeline scrub 60 fps, memória ≤ baseline+10 %.
- [ ] **Step 2: Run test** → FAIL (baseline ainda não existe).
- [ ] **Step 3: Gerar baseline** – roda script `scripts/capture-baseline.mjs` antes do redesign (já feito na Parte 4). Agora roda pós-redesign e compara.
- [ ] **Step 4: Implement testes** – usa `agent-browser` para navegar, snapshot, screenshot; `axe-core` para a11y; `performance.measure` para FPS/memória.
- [ ] **Step 5: Run tests** → PASS.
- [ ] **Step 6: Commit**
```bash
git add tests/visual-regression.test.js tests/accessibility.test.js tests/performance.test.js scripts/capture-baseline.mjs package.json
git commit -m "test: visual regression, accessibility, performance gates"
```

---

### Task 11: Documentação Final e Entrega
**Files:**
- Create/Update: `docs/DESIGN.md`
- Create/Update: `docs/AGENTS.md`
- Create: `docs/RELATORIO_DESIGN.html` (autocontido)
- Create: `LEIA_ME_PRIMEIRO.md`
- Test: `docs/check-docs.mjs` (valida links, imagens)

**Interfaces:**
- Consome: todos artefatos gerados nas tarefas anteriores.
- Produz: documentação completa para manutenção futura.

- [ ] **Step 1: Write failing test** – script verifica existência de seções obrigatórias em cada doc.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Escrever `DESIGN.md`** – conceito, tokens, proporções, materiais, assinaturas, movimento, regras de uso, como estender.
- [ ] **Step 4: Escrever `AGENTS.md`** – receitas: adicionar componente, adicionar tema, adicionar ilustração; regras: sem cores soltas, sem animação fora dos tokens, medir antes de adicionar efeito.
- [ ] **Step 5: Gerar `RELATORIO_DESIGN.html`** – antes/depois lado a lado (2 temas × 4 horas), catálogo, análise sinais IA removidos, notas anti‑IA antes/depois, números perf/mem, decisões.
- [ ] **Step 6: Escrever `LEIA_ME_PRIMEIRO.md`** – pronto/comprovado, parcial, não verificado, decisões tomadas, dependências do usuário, como rodar testes/medições, como voltar atrás (tags/git), resultado instalação ferramentas (versões).
- [ ] **Step 7: Run doc check** → PASS.
- [ ] **Step 8: Commit**
```bash
git add docs/DESIGN.md docs/AGENTS.md docs/RELATORIO_DESIGN.html LEIA_ME_PRIMEIRO.md docs/check-docs.mjs
git commit -m "docs: final design system docs, report, and quick-start guide"
```

---

### Task 12: Tag Final e Limpeza de Branch
**Files:** (nenhum novo)
**Steps:**
- [ ] `git tag design-autoral-final`
- [ ] `git log --oneline -20` → confirmar histórico limpo
- [ ] `npm run test:all` → PASS
- [ ] `agent-browser` smoke test em 3 vídeos (curto, médio, 4K) → PASS
- [ ] **Commit final** (se necessário) e push **NÃO** (conforme regra).

---

## Execution Handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-10-24-apollo-cut-redesign-implementation.md`.

**Recommended execution approach:** **Subagent-driven** – cada tarefa (1‑12) pode rodar em worktree isolada (`using-git-worktrees`) porque telas/componentes têm arquivos distintos; apenas Tasks 1‑3 são pré‑requisitos sequenciais. Isso maximiza paralelismo e isola falhas.

Please review the plan. Does it capture what you want?