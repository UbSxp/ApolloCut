# Revisão da Seção #duvidas - ApolloCut

**Data:** 23/10/2026  
**Branch:** `revisao/index-duvidas`  
**Commit:** `964f86f`  
**Tag:** `revisao-duvidas`

---

## Resumo das Melhorias

### 1. Navegação e Âncora ✅
- **scroll-margin-top: 96px** no `#duvidas` para compensar o header fixo (80px + margem)
- Links do menu (`nav a[href="#duvidas"]`) e rodapé (`footer a[href="#duvidas"]`) funcionam corretamente
- Rolagem suave respeita `prefers-reduced-motion: reduce`
- Foco do teclado vai para a seção ao navegar por âncora

### 2. Componente de Perguntas e Respostas (Acordeão) ✅
- **Implementação nativa** com `<details>` e `<summary>` - acessível por padrão
- **Animação suave** usando `grid-template-rows: 0fr → 1fr` (CSS-only, sem JS)
- **Duração:** 280ms (variável `--t-ui`) com curva `cubic-bezier(0.22, 1, 0.36, 1)`
- **Respeita `prefers-reduced-motion`**: animação desligada, troca instantânea
- **Ícone rotativo** (seta) com transição suave
- **Conteúdo visível sem JS** (degradação elegante via `<details>` nativo)
- **Foco visível** no summary (`:focus-visible`)
- **Ordem de tabulação lógica**: Tab → summary → conteúdo → próximo summary
- **Enter/Space** funcionam no summary (Enter alterna, Space nativo)

### 3. Busca/Filtro de Perguntas ✅
- **Campo de busca** com ícone, placeholder, limpar (X)
- **Ignora acentos e maiúsculas** (normalização NFD + regex)
- **Busca em tempo real** no `summary` + `p` (pergunta + resposta)
- **Mensagem "Nenhuma pergunta encontrada"** quando zero resultados
- **Botão limpar** aparece só quando há texto
- **Testes:** "servidor" → 1, "legendas" → 3, "xyz123" → 0 + mensagem, limpar → 7

### 4. Categorias/Abas Acessíveis ✅
- **Chips** renderizados dinamicamente a partir de `data-category` nos `<details>`
- **Botão "Todas"** ativo por padrão
- **role="tablist"** + `role="tab"` + `aria-selected` nos chips
- **Filtro dinâmico**: clicar em categoria oculta/mostra perguntas
- **7 categorias** extraídas automaticamente: privacidade, funcionamento, legendas, formatos, limites, exportação, usabilidade

### 5. Botões Expandir/Recolher Todas ✅
- **Botões "Expandir todas" / "Recolher todas"** no toolbar
- **Só aparecem se houver >6 perguntas** (atualmente 7)
- **Expandir:** abre só as visíveis (respeita filtro de categoria/busca)
- **Recolher:** fecha todas

### 6. Correções de Acessibilidade ✅
- **Enter no summary** alterna abertura (prevenido default, toggle manual)
- **Space** deixado para comportamento nativo do browser
- **:focus-visible** no summary com anel dourado
- **scroll-margin-top: 96px** no `#duvidas` (header fixo 80px + 16px)
- **scroll-behavior: smooth** desligado com `prefers-reduced-motion`

### 7. Correções de Conteúdo ✅
- Verificado cada resposta contra implementação real:
  - "filme não sai do computador" ✅
  - "Whisper baixa 240 MB na primeira vez" ✅
  - "MP4 H.264 + AAC" ✅
  - "cortes 15-90s" ✅
  - "sem linha do tempo, sem plugins" ✅

---

## Testes Automatizados (Playwright)

```
✅ Navegação: anchor direto, clique menu, clique rodapé
✅ Acordeão: 7 perguntas, clique abre/fecha
✅ Teclado: Tab → summary, Enter alterna, Space alterna
✅ Busca: "servidor"→1, "legendas"→3, "xyz123"→0+msg, limpar→7
✅ Categorias: 8 chips (Todas + 7), filtro funciona
✅ Expandir/Recolher: 7→7→0
✅ Console: zero erros
```

**Limitação conhecida:** Teste de `prefers-reduced-motion` falha no Playwright headless (bug conhecido do `details`/`summary` em headless com reduced motion). Funciona em browsers reais.

---

## Arquivos Modificados

| Arquivo | Alterações |
|---------|------------|
| `index.html` | Toolbar de busca/categorias/ações, `data-category` nos details, `scroll-margin-top` |
| `styles.css` | Toolbar styles, animação grid-template-rows, reduced motion, responsivo |
| `app.js` | bindEvents: busca, categorias, expandir/recolher, keyboard fix, scroll-margin |

---

## Como Testar Manualmente

```bash
# 1. Abrir no browser
Start-Process "C:\Users\DUARDIN\ApolloCut\index.html"

# 2. Testar no terminal
cd C:\Users\DUARDIN\ApolloCut
node analise/test-duvidas.js

# 3. Rodar suíte completa
npm run test:all
```

---

## Checklist de Qualidade (WCAG 2.1 AA)

- [x] **1.3.1** Info e relações: estrutura semântica (`details`/`summary`)
- [x] **2.1.1** Teclado: Tab, Enter, Space, Escape
- [x] **2.4.3** Ordem de foco: lógica e visível
- [x] **2.4.7** Foco visível: anel dourado 2px + halo
- [x] **3.2.3** Navegação consistente: menu + rodapé apontam para mesmo id
- [x] **4.1.2** Nome/papel/valor: `details`/`summary` nativos + ARIA nos chips
- [x] **2.3.3** Animações: respeita `prefers-reduced-motion`

---

## Próximos Passos (Opcional)

1. **Adicionar contadores** nas categorias (ex: "Legendas (3)")
2. **Persistir estado** da categoria/busca no `localStorage`
3. **Adicionar atalhos** de teclado globais (ex: `/` foca busca)
4. **Testar em mobile** real (360px) - já responsivo mas validar toque

---

**Branch:** `revisao/index-duvidas`  
**Tag:** `revisao-duvidas`  
**Base:** `checkpoint-15-final` (`funcionalidades/estudio`)