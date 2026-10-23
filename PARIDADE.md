# Paridade de Funcionalidades — Classificação e Progresso

Data: 23/10/2026  
Base: commit `fb07e0d` (tag `checkpoint-09-reframe`)  
Branch: `funcionalidades/estudio`

## Tabela de Classificação (conforme Parte 4)

| # | Funcionalidade | Categoria | Estado | Evidência | Limitações conhecidas |
|---|----------------|-----------|--------|-----------|------------------------|
| 1 | Cortes automáticos (arquivo, pasta monitorada) | A | **Parcial** | `src/core/cut-engine.js`: pipeline completo local; fake provider para testes | Link (YouTube/Drive) = Cat. B; vídeos >1h testados em chunks; heurística sem LLM |
| 2 | Legendas automáticas (estilos, palavra por palavra, destaque, tradução, export SRT/ASS) | A | **Parcial** | `lib/captions.js` + 9 testes; UI de legendas no ateliê | Tradução = Cat. B (TranslationProvider); export ASS não implementado |
| 3 | Dublagem de áudio com IA (vários idiomas) | B | **Não iniciado** | `src/providers/interfaces.js` + fake/real TTSProvider | Requer ElevenLabs/outro TTS; sync com vídeo |
| 4 | Reenquadramento inteligente 16:9→9:16 | A | **Implementado** | `src/core/reframe-engine.js`: YuNet, tracking, 6 layouts, zonas seguras, render | YuNet carrega ONNX via CDN na 1ª vez; MediaPipe fallback pendente |
| 5 | Editor de cortes, edição em massa, Brand Kit, templates | A | **Não iniciado** | Ateliê base existe (abas Cena/Legendas/Publicar) | Timeline, divisão/junção, Brand Kit, templates = pendentes |
| 6 | Cortes de lives (Twitch, Kick) | B | **Não iniciado** | `SocialPublishProvider` + yt-dlp/streamlink detection pendente | Importação por link = Cat. B |
| 7 | Agendamento e publicação automática (OAuth) | B | **Não iniciado** | `SocialPublishProvider` esqueleto (YouTube) | Requer tokens OAuth no keyring |
| 8 | Geração de vídeo com IA (texto/imagem → 9:16/16:9) | B | **Não iniciado** | `VideoGenerationProvider` (Replicate esqueleto) | Custo por segundo, múltiplos modelos |
| 9 | Geração/edição de imagem com IA (capas, thumbnails, ref.) | A/B | **Parcial** | Compositor capa local (PNG 1080×1920) + `ImageGenerationProvider` | Geração IA = Cat. B (Replicate fake/real) |
| 10 | Troca de personagem/cenário/estilo (vídeo-para-vídeo) | B | **Não iniciado** | `VideoToVideoProvider` esqueleto (Replicate) | Requer modelo video-to-video |
| 11 | Orçamento unificado (saldo, custo antes de operar, teto diário/mensal) | B | **Implementado** | `src/budget/ledger.js`: IndexedDB, tetos, confirmação, relatórios | Ledger local apenas; sem cobrança real |
| 12 | API local, CLI, servidor MCP | B | **Não iniciado** | Arquitetura de provedores + fila pronta | Endpoints REST/WS, CLI, MCP server |
| 13 | Projetos salvos, fila de trabalhos, estatísticas de uso | A | **Parcial** | Fila persistente (`src/queue/job-queue.js`), ajustes no `localStorage` | Projetos completos, estatísticas, dashboard = pendentes |

## Resumo por Categoria

### Categoria A (local e completo) — 5 itens + partes de 9
- **Implementados**: 1 (motor cortes), 2 (legendas base), 4 (reenquadramento), 11 (orçamento), 13 (fila base)
- **Parciais**: 5 (editor base), 9 (compositor thumbnails)
- **Faltando**: 5 (edição em massa, Brand Kit, templates), 13 (projetos completos, estatísticas), 2 (tradução, export ASS)

### Categoria B (provedor externo plugável) — 8 itens + partes de 1, 6, 9
- **Base pronta**: Interfaces + fake providers + esqueletos reais desativados
- **Pendentes**: Integração real (chaves), UI de configuração, testes com chaves reais

### Categoria C (fora do escopo)
- Pagamentos, campeonatos, afiliados, apps nativos, páginas de marketing.

## Progresso por Ordem de Execução

| Passo | Item | Status | Checkpoint |
|-------|------|--------|------------|
| 1 | Verificação de base | ✅ | `checkpoint-07-zona-segura` |
| 2 | Arquitetura provedores, fila, orçamento | ✅ | `checkpoint-08-providers-queue-budget` |
| 3 | Motor de cortes com IA | ✅ | `checkpoint-08-providers-queue-budget` (incluído) |
| 4 | Reenquadramento inteligente | ✅ | `checkpoint-09-reframe` |
| 5 | Editor, edição em massa, Brand Kit, templates | 🔄 **Próximo** | `checkpoint-11-editor-brandkit` (planejado) |
| 6 | Legendas avançadas (tradução, ASS) | ⏳ | `checkpoint-12-legendas-avancadas` |
| 7 | Compositor thumbnails + provedor imagem | ⏳ | `checkpoint-13-thumbnails` |
| 8 | Dublagem (TTS) | ⏳ | `checkpoint-14-dublagem` |
| 9 | Agendamento/publicação (OAuth) | ⏳ | `checkpoint-15-agendamento` |
| 10 | Monitoramento lives | ⏳ | `checkpoint-16-lives` |
| 11 | Geração vídeo + troca personagem | ⏳ | `checkpoint-17-geracao-video` |
| 12 | API local, CLI, MCP | ⏳ | `checkpoint-18-api-cli-mcp` |
| 13 | Estatísticas, polimento, docs | ⏳ | `checkpoint-19-estatisticas` |

## Tags de Checkpoint Realizadas

- `checkpoint-00-base` — Estado inicial
- `checkpoint-01-legendas` — Legendas corrigidas
- `checkpoint-02-tema` — Tema claro/escuro/auto
- `checkpoint-03-acessibilidade` — Foco, ARIA, anúncios
- `checkpoint-04-foco` — Foco preso, retorno
- `checkpoint-05-exportacao` — Exportação MP4 9:16
- `checkpoint-06-exportacao` — Exportação confiável, ateliê visível, a11y
- `checkpoint-07-zona-segura` — Legenda queimada na zona segura
- `checkpoint-08-providers-queue-budget` — Providers, fila, orçamento, motor de cortes
- `checkpoint-09-reframe` — Reenquadramento inteligente 16:9→9:16

## Próximos Checkpoints Planejados

- `checkpoint-10-editor-ui` — Integração UI motor cortes + reenquadramento no ateliê
- `checkpoint-11-editor-brandkit` — Editor completo, edição em massa, Brand Kit, templates
- `checkpoint-12-legendas-avancadas` — Tradução + export ASS
- `checkpoint-13-thumbnails` — Compositor + ImageGenProvider
- `checkpoint-14-dublagem` — TTS (ElevenLabs fake/real)
- `checkpoint-15-agendamento` — SocialPublishProvider + OAuth
- `checkpoint-16-lives` — Monitoramento Twitch/Kick
- `checkpoint-17-geracao-video` — VideoGen + VideoToVideo
- `checkpoint-18-api-cli-mcp` — API/CLI/MCP
- `checkpoint-19-estatisticas` — Dashboard, docs, entrega final