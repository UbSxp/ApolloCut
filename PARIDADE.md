# Paridade de Funcionalidades — Classificação

Data: 23/10/2026  
Base: commit `9b6b7cf` (tag `checkpoint-07-zona-segura`)  
Branch: `funcionalidades/estudio`

## Tabela de Classificação (conforme Parte 4)

| # | Funcionalidade | Categoria | Estado | Evidência | Limitações conhecidas |
|---|----------------|-----------|--------|-----------|------------------------|
| 1 | Cortes automáticos (arquivo, pasta monitorada) | A | Parcial | `app.js`: análise visual + Whisper local; `tests/ui-export.test.js` passa | Link (YouTube/Drive) = Cat. B; vídeos >1h não testados; heurística de pontuação sem LLM |
| 2 | Legendas automáticas (estilos, palavra por palavra, destaque, tradução, export SRT/ASS) | A | Parcial | `lib/captions.js` + 9 testes; UI de legendas no ateliê | Tradução = Cat. B (provedor externo); export ASS não implementado |
| 3 | Dublagem de áudio com IA (vários idiomas) | B | Não iniciado | — | Requer provedor TTS (local ou externo); nenhum integrado |
| 4 | Reenquadramento inteligente 16:9→9:16 (rostos, layouts, zonas seguras) | A | Não iniciado | — | Requer detector de rosto leve (YuNet/MediaPipe/OpenCV) offline |
| 5 | Editor de cortes, edição em massa, Brand Kit, templates | A | Parcial | Ateliê com abas Cena/Legendas/Publicar; cards de corte funcionam | Edição em massa, Brand Kit, templates = pendentes |
| 6 | Cortes de lives (Twitch, Kick) | B | Não iniciado | — | Importação por link = Cat. B; yt-dlp/streamlink não detectados |
| 7 | Agendamento e publicação automática (OAuth) | B | Não iniciado | — | Requer provedores de publicação por API oficial |
| 8 | Geração de vídeo com IA (texto/imagem → 9:16/16:9) | B | Não iniciado | — | Provedor de geração de vídeo; custo por segundo |
| 9 | Geração/edição de imagem com IA (capas, thumbnails, ref.) | A (compositor offline) / B (geração IA) | Parcial | Compositor de capa local funciona (PNG 1080×1920) | Geração por IA = Cat. B; provedor não integrado |
| 10 | Troca de personagem/cenário/estilo (vídeo-para-vídeo) | B | Não iniciado | — | Requer provedor video-to-video |
| 11 | Orçamento unificado (saldo, custo antes de operar, teto diário/mensal) | B | Não iniciado | — | Ledger local, confirmação explícita, teto configurável |
| 12 | API local, CLI, servidor MCP | B | Não iniciado | — | Arquitetura de provedores e fila precisam existir antes |
| 13 | Projetos salvos, fila de trabalhos, estatísticas de uso | A | Parcial | `localStorage` salva ajustes; `state` em memória | Fila persistente, retomada após fechar, estatísticas = pendentes |

## Resumo por Categoria

### Categoria A (local e completo) — 5 itens + partes de 9
- **Prontos/parciais**: 1 (arquivo/pasta), 2 (legendas base), 5 (editor base), 9 (compositor thumbnails), 13 (projetos/ajustes)
- **Faltando**: heurística de cortes com LLM opcional, reenquadramento, edição em massa, Brand Kit, templates, export ASS, fila persistente, estatísticas

### Categoria B (provedor externo plugável) — 8 itens + partes de 1, 6, 9
- **Nenhum implementado**. Pré-requisito: arquitetura de interfaces de provedor + fila + orçamento.

### Categoria C (fora do escopo)
- Pagamentos, campeonatos, afiliados, apps nativos, páginas de marketing.

## Próximo Passo (Ordem de Execução, Item 2) — **EM ANDAMENTO**
**Arquitetura de provedores, fila persistente e orçamento de gastos** — base para todos os itens da Categoria B.

### ✅ Concluído
- **Interfaces** (`src/providers/interfaces.js`): 8 interfaces tipadas (LLM, Transcription, Translation, TTS, ImageGen, VideoGen, VideoToVideo, SocialPublish) com capacidades, custos, validação, timeout, retry, cancelamento, erros PT-BR.
- **Provedores Fake** (`src/providers/fake-providers.js`): 8 implementações determinísticas, offline, sem chave — para testes automatizados e CI.
- **Provedores Reais (esqueletos)** (`src/providers/real-providers.js`): OpenAI (LLM, Whisper), ElevenLabs (TTS), Replicate (Image/Video), YouTube OAuth — desativados até chave inserida.
- **Registro central** (`src/providers/index.js`): carrega fakes + reais condicionais, API unificada (`getProviderFor`, `executeWithProvider`, `estimateCost`).
- **Fila persistente** (`src/queue/job-queue.js`): IndexedDB, 6 estados, worker pool com limites GPU/CPU/rede, retry/backoff, progresso real, cancelamento, pausa/retomada.
- **Orçamento/Ledger** (`src/budget/ledger.js`): IndexedDB, teto diário/mensal, limiar de confirmação, relatórios por provedor/operação/unidade, poda automática.

### 🔄 Em andamento
- Integração da fila e orçamento no `app.js` (bootstrap, UI de jobs, painel de orçamento).
- Testes automatizados da fila e orçamento (usando fake providers).

### Próximo (Item 3): Motor de Cortes com IA
Pipeline: extrair áudio → transcrever (timestamps/palavra) → segmentar sentenças/tópicos → pontuar candidatos → remover sobreposições → escolher melhores (duração alvo por plataforma) → refinar bordas (fim de frase + fade) → renderizar aprovados.
Pontuação explicável: gancho 3s, completude, densidade, energia, picos, perguntas, mudança de cena, rosto. LLM opcional para ranquear/títulos; heurística local robusta.
Prévia: lista sugestões com miniaturas/tempos antes de renderizar. Usuário aprova/rejeita/ajusta.
Vídeos longos (10h): blocos com checkpoints, proxy baixa resolução, transcrição em janelas com sobreposição, tempos globais consistentes.

---

**Tags de checkpoint planejadas**
- `checkpoint-08-providers` — interfaces + fake providers + fila + ledger
- `checkpoint-09-cortes-ia` — motor de cortes com IA (item 1 completo)
- `checkpoint-10-reenquadramento` — item 4
- `checkpoint-11-editor-brandkit` — item 5
- `checkpoint-12-legendas-avancadas` — item 2 completo (tradução, ASS)
- `checkpoint-13-thumbnails` — item 9 (compositor + provedor imagem)
- `checkpoint-14-dublagem` — item 3
- `checkpoint-15-agendamento` — item 7
- `checkpoint-16-lives` — item 6
- `checkpoint-17-geracao-video` — itens 8 e 10
- `checkpoint-18-api-cli-mcp` — item 12
- `checkpoint-19-estatisticas` — item 13 completo + polimento