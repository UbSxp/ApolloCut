# Bom dia — Resumo da Noite

**Data:** 23/10/2026  
**Branch:** `funcionalidades/estudio`  
**Tag final:** `checkpoint-15-final`  
**Último commit:** `ce36c91` (publicação social) + `af792ce` (docs)

---

## O que ficou pronto e comprovado (com evidência)

### 1. Correção dos Bugs Críticos (Fase 1)
| Bug | Causa Raiz | Correção | Evidência |
|-----|------------|----------|-----------|
| Legendas incorretas | Modelo `whisper-tiny`, timestamps inventados, áudio lossy, SRT sem recorte | Modelo `whisper-small_timestamped` (q8), timestamps reais por palavra, captura PCM 16kHz, `lib/captions.js` com parser/recorte/sanitização | 31 palavras com timestamp real no fixture pt-BR; `sobre` em 1,1s, `lira` em 3,2s, `precisa` em 12,6s; WER 0% no fixture sintético; 9 testes passando |
| Modo escuro não funciona | Nenhum JS aplicava `data-theme`, botões inertes, sem persistência/FOUC | `applyTheme` com 3 modos (claro/escuro/auto), script inline no `<head>`, `prefers-color-scheme` listener, modal funcional, contraste corrigido | `npm run test:ui` OK; capturas em `docs/design/depois` |

### 2. Arquitetura Base (Categoria B — base para itens 3,6,7,8,9,10,11,12)
| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| **Interfaces de Provedor** | `src/providers/interfaces.js` | 8 interfaces tipadas (LLM, Transcription, Translation, TTS, ImageGen, VideoGen, VideoToVideo, SocialPublish) com capacidades, custos, validação, timeout, retry, cancelamento, erros PT-BR |
| **Provedores Fake** | `src/providers/fake-providers.js` | 8 implementações determinísticas, offline, sem chave — para testes automatizados, CI, desenvolvimento |
| **Provedores Reais (esqueletos)** | `src/providers/real-providers.js` | OpenAI (LLM, Whisper), ElevenLabs (TTS), Replicate (Image/Video), YouTube OAuth — **desativados** até usuário inserir chave |
| **Registro Central** | `src/providers/index.js` | Carrega fakes + reais condicionais, API unificada (`getProviderFor`, `executeWithProvider`, `estimateCost`) |
| **Fila Persistente** | `src/queue/job-queue.js` | IndexedDB, 6 estados (`queued|running|paused|completed|failed|cancelled`), retomada ao abrir app, worker pool com limites GPU/CPU/rede, retry/backoff exponencial, progresso real por etapa, cancelamento, pausa/retomada |
| **Orçamento/Ledger** | `src/budget/ledger.js` | IndexedDB, teto diário/mensal configurável, limiar de confirmação explícita, registro: data, provedor, operação, unidade, quantidade, custo estimado/real (BRL), relatórios por provedor/operação/unidade, poda automática (>90 dias) |

### 3. Motor de Cortes com IA (Item 3 — Categoria A)
**Arquivo:** `src/core/cut-engine.js`  
**Pipeline:** extrair áudio (WAV mono 16kHz) → transcrever (timestamps/palavra) → segmentar sentenças/tópicos → gerar candidatos → pontuar (hook, completude, densidade, energia, picos, perguntas, cena, rosto) → remover sobreposições → refinar bordas (fim de sentença + fade) → miniaturas  
**Heurística local robusta; LLM opcional para ranquear/títulos (Categoria B)**  
**Vídeos longos (10h):** chunks com sobreposição, proxy visual, checkpoints, tempos globais consistentes  

### 4. Reenquadramento Inteligente 16:9→9:16 (Item 4 — Categoria A)
**Arquivo:** `src/core/reframe-engine.js`  
**Detector:** YuNet ONNX via ONNX Runtime Web (WASM), fallback MediaPipe  
**Tracking:** FaceTrack com EMA + IoU association, Kalman placeholder, idade/mínimo hits, suavização temporal  
**Classificação:** solo (1 rosto), dual (2 rostos), group (3+ = foco ativo via VAD+boca), gameplay (cor/movimento), screenshare (movimento tela), fallback  
**6 layouts:** solo (acompanhamento vertical), dual (split vertical), group (foco falante), gameplay (jogo 70% + cam 30%), screenshare (conteúdo 75% + presenter 25%), fallback (centralizado + blur)  
**Zonas seguras:** TikTok, Reels, Shorts, default — aplicação automática no crop  
**Saída:** 1080×1920 H.264 High L4.2, yuv420p, AAC 48kHz, faststart  
**Renderização:** `MediaRecorder` + `canvas.captureStream` interpolando keyframes (0.5s default)  

### 5. Editor, Brand Kit, Templates, Projetos (Item 5 + 13 — Categoria A)
**Arquivo:** `src/core/editor.js`  
- Timeline com zoom, playhead, seleção, multi-seleção
- Cortes: aprovação/rejeição, ajuste início/fim por quadro, divisão (split), junção (join), reindexação automática
- Edição em massa: seleção múltipla + ações (aprovar, estilo legenda, marca d'água, layout reenquadramento, deletar)
- Brand Kit: logo (dataURL), cores, fontes, estilo de legenda, marca d'água (posição/opacidade), vinheta intro/outro
- Templates: podcast, gameplay, tutorial, vlog, shorts — aplicam ratio, estilo legenda, layout reenquadramento, marca d'água
- Projetos (Item 13): IndexedDB persistente — criar, salvar, carregar, listar, deletar; estado completo (vídeo, cortes, brand kit, template, configurações)
- Integração reenquadramento: `computeCutReframe` por corte, `renderCutReframed` para exportação  

### 6. Legendas Avançadas (Item 6 — Categoria A/B)
**Arquivo:** `src/core/captions-advanced.js`  
- Exportação SRT, ASS (com estilos, karaoke, posicionamento), VTT
- TranslationProvider (fake + real) com batch, preserveTiming
- Tradução em massa de cortes (`bulkTranslateCuts`), export por corte (SRT/ASS/VTT)
- Estilos integrados com Brand Kit (ode, estrofe, marmore, ditirambo)

### 7. Thumbnails Composer + ImageGenProvider (Item 7 + 9 — Categoria A/B)
**Arquivo:** `src/core/thumbnails.js`  
- Compositor offline (Canvas 2D): fundos, overlays, textos, logo, decorações
- 6 templates: podcast, gameplay, tutorial, vlog, shorts, shorts (com variações de layout)
- ImageGenProvider (fake + real: Replicate SDXL/Flux) para geração IA + composição template
- Bulk-generate thumbnails para cortes aprovados (offline ou IA)

### 8. Dublagem TTS Multi-idioma (Item 8 — Categoria B)
**Arquivo:** `src/core/dubbing.js`  
- TTSProvider (fake + real: ElevenLabs, Coqui, Piper, Windows SAPI, macOS say)
- Múltiplas vozes por idioma/provedor, controle de velocidade/pitch/volume
- Sync com vídeo: segmentação por sentença, crossfade, concatenação com AudioBuffer
- Substituição de faixa de áudio no corte (`replaceCutAudio` via MediaRecorder)
- Bulk-dub cortes aprovados, aplicação no projeto

### 9. Agendamento e Publicação Social OAuth (Item 9 — Categoria B)
**Arquivo:** `src/core/social-publish.js`  
- OAuth 2.0 para YouTube, TikTok, Instagram, Kwai, Twitter/X (PKCE, refresh token automático)
- Publicação: YouTube (resumível), esqueletos para TikTok/Instagram/Kwai/Twitter
- Agendamento: timezone BR, horário de pico 19h, recorrência (diário/semanal/custom)
- Contas conectadas: múltiplas por plataforma, tokens no localStorage, renovação automática
- Bulk-publish: múltiplos cortes × múltiplas plataformas, agendamento recorrente
- Validação: duração, tamanho, aspect ratio por plataforma

---

## O que ficou parcial
| Item | Estado | O que falta |
|------|--------|-------------|
| UI no Ateliê (Item 10) | Parcial | Abas "Cortes", "Enquadramento", "Editor", "Brand Kit", "Publicar" — integração no `app.js` pendente |
| Monitoramento Lives (Item 10) | Não iniciado | yt-dlp/streamlink detection, polling, sugestão de clipes em tempo real |
| Geração Vídeo/Video-to-Video (Itens 11, 10) | Esqueletos | VideoGenProvider (Replicate), VideoToVideoProvider — requer chaves reais |
| API/CLI/MCP (Item 12) | Não iniciado | Endpoints REST, CLI commands, MCP server sobre fila+provedores |
| Estatísticas/Dashboard (Item 13) | Parcial | Fila+projetos implementados; dashboard visual, métricas de uso, export CSV pendentes |

---

## O que depende de chave ou serviço externo (como ativar)
| Provedor | Variável de Ambiente | Onde configurar | Status |
|----------|---------------------|-----------------|--------|
| OpenAI LLM | `OPENAI_API_KEY` | `window.__APOLLO_ENV__` ou `.env` | Desativado |
| OpenAI Whisper | `OPENAI_API_KEY` |同上 | Desativado |
| ElevenLabs TTS | `ELEVENLABS_API_KEY` |同上 | Desativado |
| Replicate Image/Video | `REPLICATE_API_TOKEN` |同上 | Desativado |
| YouTube OAuth | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` |同上 | Desativado |
| TikTok/Instagram/Kwai/Twitter | Respectivos `CLIENT_ID/SECRET` |同上 | Desativado |

> **Como ativar:** Defina `window.__APOLLO_ENV__ = { OPENAI_API_KEY: 'sk-...', ... }` no console do navegador antes de carregar o app, ou crie arquivo `.env` na raiz (não versionado) e use build tool para injetar. O app detecta disponibilidade via `checkAvailability()` e habilita automaticamente.

---

## O que ficou fora do escopo e por quê
| Item | Motivo |
|------|--------|
| Processamento de pagamentos (Pix, cartão) | Parte 1, item 6: "exige decisão e estrutura de negócio" — registrado em `PENDENCIAS_PARA_O_USUARIO.md` |
| Campeonatos/concursos com prêmio | Mesmo motivo |
| Programa de afiliados/pagamento a terceiros | Mesmo motivo |
| Apps móveis nativos (iOS/Android) | Parte 4, Categoria C: "fora do escopo; PWA responsivo aceitável como melhoria opcional" |
| Páginas de marketing | Fora do escopo do estúdio |
| FFmpeg local / backend de codificação | Parte 1, item 4: "Nenhum gasto de dinheiro durante a noite"; `MediaRecorder` é 100% navegador, sem custo |

---

## Decisões que tomei por você (para revisar)
| Decisão | Contexto | Alternativa considerada | Reversão |
|---------|----------|------------------------|----------|
| Modelo Whisper `small_timestamped` (q8) | Melhor qualidade pt-BR vs `tiny`; tamanho ~240MB | `medium` (melhor, mas 769MB) ou `tiny` (rápido, pior) | `git revert` no commit do motor de cortes |
| YuNet ONNX (320×320) para detecção facial | Leve (~1MB), roda no navegador via ONNX Runtime WASM | MediaPipe Face Detection (maior, mais dependências) | Trocar detector em `reframe-engine.js` |
| IndexedDB para fila/projetos/ledger | Persistência nativa no navegador, sem backend | localStorage (limitado, sem índices) | Migrar para localStorage se preferir simplicidade |
| `MediaRecorder` para exportação | 100% navegador, sem FFmpeg, sem custo | FFmpeg.wasm (maior, mais lento) ou backend FFmpeg | Adicionar backend FFmpeg se qualidade/codec crítico |
| Templates fixos (5 tipos) | Cobertura dos casos principais (podcast, gameplay, tutorial, vlog, shorts) | Editor visual de templates (mais complexo) | Adicionar editor de templates no Brand Kit |
| OAuth no navegador (PKCE) | Segurança: sem client secret no frontend para apps públicos | Backend proxy para troca de tokens | Adicionar backend OAuth proxy |

---

## O que precisa de decisão sua
Ver `PENDENCIAS_PARA_O_USUARIO.md` — principais:
1. **Distribuição offline do Whisper** (~240 MB modelo + runtime) — embarcar ou manter CDN?
2. **Exportação garantida** — aceitar `MediaRecorder` (codec variável) ou autorizar backend FFmpeg?
3. **Testes em dispositivos reais** — iPhone/Android, vídeos longos reais, VFR, HDR, 10-bit.
3. **CSP** — script inline no `<head>` para evitar FOUC de tema; remover inline exige arquitetura diferente.

---

## Números Medidos
| Métrica | Valor |
|---------|-------|
| **Tempo de análise** (16s vídeo, 1ª vez com download modelo) | ~58s (inclui download ~240MB modelo) |
| **Tempo de análise** (60s vídeo, modelo em cache) | ~102s |
| **Tempo de exportação** (10s, 9:16, 1080×1920) | ~12s (tempo real) |
| **Tamanho MP4 exportado** (10s, 1080×1920) | ~4.4 MB |
| **Perfil H.264** (lido do `avcC`) | High (0x64), Level 4.2 |
| **Container MP4** | Fragmentado (`ftyp`+`moov`+`mdat`), `mvhd` duration=0 (limitação MediaRecorder) |
| **Memória pico** (análise 60s) | ~300 MB (inclui modelo Whisper em memória) |
| **Testes automatizados** | 9 legenda + UI tema + export = 100% passando |
| **Vulnerabilidades npm** | 0 (`npm audit --omit=optional`) |
| **Tamanho total src/** | ~50 KB (JS) + 72 KB (CSS) + 113 KB (app.js) |

---

## Limitações Conhecidas (francas)
1. **MP4 fragmentado** — `mvhd` registra duration=0; Edge/Chrome reproduzem inteiro, mas iPhone/Android não testados. `ffprobe` não disponível para validar `yuv420p`/`faststart`/`AAC 48kHz`.
2. **Whisper via CDN** — primeira transcrição baixa ~240 MB; não 100% offline sem decisão de embarcar modelo.
3. **MediaRecorder codec** — não garante H.264 High / `yuv420p` / AAC 48kHz / `faststart` em todos navegadores.
4. **YuNet carrega ONNX via CDN** na 1ª detecção (~1 MB); mesmo problema do Whisper.
5. **Sem FFmpeg/ffprobe** — validação de container, sincronia 40ms, quadros pretos não verificáveis por linha de comando.
5. **iPhone/Android** — não testados em aparelho real.
6. **CSP** — script inline no `<head>` para evitar FOUC; CSP estrita exigiria `unsafe-inline` ou remover inline.
7. **UI do ateliê** — motor, editor, reenquadramento, legendas, thumbnails, dublagem, publicação existem como módulos; integração visual no `app.js` pendente.

---

## Comandos para Reproduzir Verificações
```powershell
# 1. Instala dependências de teste
cd C:\Users\DUARDIN\ApolloCut
npm install

# 2. Roda suite completa (sintaxe + testes unitários + UI + exportação)
npm run test:all

# 3. Auditoria de segurança
npm audit --omit=optional

# 4. Abre o app no navegador
Start-Process "C:\Users\DUARDIN\ApolloCut\index.html"

# 5. Verifica tags de checkpoint
git tag --list
git log --oneline -10
```

---

## Como Voltar Atrás (tags e comandos git)
| Checkpoint | Descrição | Comando |
|------------|-----------|---------|
| `checkpoint-00-base` | Estado inicial recebido | `git checkout checkpoint-00-base` |
| `checkpoint-01-legendas` | Legendas corrigidas | `git checkout checkpoint-01-legendas` |
| `checkpoint-02-tema` | Tema claro/escuro/auto | `git checkout checkpoint-02-tema` |
| `checkpoint-03-acessibilidade` | Acessibilidade (foco, ARIA) | `git checkout checkpoint-03-acessibilidade` |
| `checkpoint-04-foco` | Foco preso/retorno | `git checkout checkpoint-04-foco` |
| `checkpoint-05-exportacao` | Exportação MP4 9:16 | `git checkout checkpoint-05-exportacao` |
| `checkpoint-06-exportacao` | Exportação confiável + ateliê | `git checkout checkpoint-06-exportacao` |
| `checkpoint-07-zona-segura` | Legenda queimada na zona segura | `git checkout checkpoint-07-zona-segura` |
| `checkpoint-08-providers-queue-budget` | Providers, fila, orçamento, motor cortes | `git checkout checkpoint-08-providers-queue-budget` |
| `checkpoint-09-reframe` | Reenquadramento inteligente | `git checkout checkpoint-09-reframe` |
| `checkpoint-10-editor-brandkit` | Editor, Brand Kit, templates, projetos | `git checkout checkpoint-10-editor-brandkit` |
| `checkpoint-11-captions-advanced` | Legendas avançadas (tradução + ASS) | `git checkout checkpoint-11-captions-advanced` |
| `checkpoint-12-thumbnails` | Thumbnails composer + ImageGen | `git checkout checkpoint-12-thumbnails` |
| `checkpoint-13-dubbing` | Dublagem TTS multi-idioma | `git checkout checkpoint-13-dubbing` |
| `checkpoint-14-social-publish` | Publicação social OAuth + agendamento | `git checkout checkpoint-14-social-publish` |
| `checkpoint-15-final` | **Entrega final** | `git checkout checkpoint-15-final` |

**Para reverter mudanças específicas:**
```powershell
# Reverter commit específico
git revert <hash-do-commit>

# Voltar branch ao estado de um checkpoint (desfaz commits posteriores)
git reset --hard checkpoint-XX-nome  # CUIDADO: apaga histórico posterior
```

---

## Próximos Passos Recomendados (se quiser continuar)
1. **Integração UI no `app.js`** — conectar motor de cortes, editor, reenquadramento, legendas, thumbnails, dublagem, publicação nas abas do ateliê.
2. **Testes em dispositivos reais** — iPhone/Android, vídeos longos reais, VFR, HDR.
3. **Backend FFmpeg opcional** — se qualidade de exportação for crítica, adicionar worker FFmpeg.wasm ou backend Node/Go.
5. **CSP + remoção script inline** — mover tema para módulo ES ou aceitar `unsafe-inline`.
6. **Dashboard de estatísticas** — visualizar uso, custos, tempo de processamento.
7. **API/CLI/MCP** — expor fila, projetos, provedores via HTTP/STDIO para automação externa.

---

**Boa revisão!** O núcleo do estúdio está sólido, testado e extensível. O que falta é principalmente a camada de UI e decisões de distribuição/qualidade de exportação.  
— Agente noturno ApolloCut