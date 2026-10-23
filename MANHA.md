# Bom dia — resumo da noite

## O que foi feito primeiro

### 1. Legendas

**Causa raiz encontrada:** o app usava `whisper-tiny`, transcrevia pedaços curtos e isolados, inventava os tempos por palavra por proporção de caracteres, capturava o áudio com `MediaRecorder` (perda + latência) e não recortava corretamente cues de SRT que atravessavam o início/fim do corte.

**Correção:**

- modelo `onnx-community/whisper-small_timestamped`, quantizado `q8`;
- `return_timestamps: "word"` com timestamps reais;
- transcrição do corte inteiro, com chunking de 30 s e stride de 5 s;
- captura PCM sem perda via `ScriptProcessorNode`, resample para 16 kHz;
- compensação da latência entre captura e reprodução;
- parser/recorte de SRT em `lib/captions.js`;
- filtro de alucinações;
- idioma do modal de ajustes ligado de verdade.

**Evidência:**

- `ptbr-fala.webm` (16 s): texto transcrito corretamente;
- 31 palavras com timestamp do modelo;
- destaque correto: `sobre` em 1,1 s, `lira` em 3,2 s, `precisa` em 12,6 s;
- WER no fixture sintético: **0,0%** (31 palavras);
- `npm test`: 9 testes puros passando;
- `long.webm` (60 s): 77 palavras com timestamp, 21 blocos, sem erro de console.

### 2. Tema

**Causa raiz:** não havia nenhum JS aplicando `data-theme`; os botões de tema e de ajustes não tinham eventos; o modal nunca abria; não havia persistência, modo automático nem proteção contra FOUC.

**Correção:**

- tema claro, escuro e automático;
- persistência em `localStorage`;
- script inline no `<head>` aplica o tema antes da primeira pintura;
- `prefers-color-scheme` com listener de mudança;
- modal de ajustes ligado;
- contraste corrigido nos botões dourados e no selo de sucesso;
- som opcional de conclusão.

**Evidência:**

- `npm run test:ui`: **OK**;
- teste cobre automático, claro, escuro, persistência, modal e idioma;
- capturas em `docs/design/depois`.

## O que melhorou, com números

| Métrica | Antes | Depois |
|---|---|---|
| Modelo de transcrição | `whisper-tiny` q8 | `whisper-small_timestamped` q8 |
| Timestamps por palavra | proporcionais/inventados | reais, 31 palavras no fixture |
| WER no fixture pt-BR | não medido; texto degradado | 0,0% |
| Captura de áudio | Opus duplo via MediaRecorder | PCM direto, 16 kHz |
| Legendas SRT em bordas | palavras de fora entravam | recorte por janela |
| Tema | só claro, botões inertes | claro/escuro/automático persistente |
| Testes | nenhum no repositório | 9 puros + 1 UI |
| Exportação de fumaça | MP4 9:16, ~4,2 MB | continua passando |

Tempo observado de transcrição no Edge headless (inclui download do modelo na primeira vez): ~44 s para 16 s de vídeo; ~102 s para 60 s de vídeo. O download do modelo é de cerca de 240 MB na primeira vez.

## O que ficou no backlog e por quê

1. **Offline real (P1):** o runtime do Transformers.js e o modelo ainda vêm de CDN/Hugging Face. Embarcar ~240 MB no projeto é uma decisão de distribuição que precisa de aprovação.
2. **Exportação garantida (P1):** não há FFmpeg; o `MediaRecorder` não garante H.264 High, `yuv420p`, AAC 48 kHz ou `faststart` em todos os navegadores.
3. **Vídeos reais (P1):** faltam testes com arquivos longos de celular/OBS, VFR, rotação, HDR, 10 bits e múltiplas faixas.
4. **Acessibilidade (P2):** falta foco preso em modais, retorno de foco, anúncio de progresso e auditoria completa por teclado.
5. **Desempenho (P2):** sem cache de transcrição e sem limite de concorrência; vídeos longos ficam lentos.
6. **Legendas (P2):** quebra de linha semântica, zona segura por plataforma, exportação SRT/ASS.
7. **UX (P3):** projetos recentes, fila de exportação, desfazer/refazer, salvamento automático.

## O que não consegui verificar

- Reprodução em iPhone e Android reais.
- `ffprobe`, `faststart`, perfil H.264 e pixel format por linha de comando: não há FFmpeg instalado.
- Sincronia de 40 ms em arquivos longos: não fiz medição com equipamento de referência.
- Áudio de fala real de pessoas (usei voz sintética Microsoft Maria).
- Todos os estados de foco/teclado e leitores de tela.
- Primeira transcrição sem internet: o app ainda depende do download do modelo.

## Decisões que tomei por você

- Usei o modelo maior (`small_timestamped`) por qualidade, aceitando download e inferência mais lentos.
- Troquei a captura de áudio por PCM com `ScriptProcessorNode`, API legada, para evitar perda dupla de Opus.
- Adotei `auto` como tema padrão.
- Mantive o CDN do Whisper nesta rodada e registrei a pendência, em vez de embarcar 240 MB sem sua decisão.
- Adicionei `puppeteer-core` apenas como dependência de teste; o app em si continua sem dependências de runtime.

## O que depende de você

- Decidir se o Whisper deve ser embarcado para uso 100% offline.
- Decidir se vale adicionar um backend local com FFmpeg para exportação garantida.
- Testar com seus vídeos reais e com o SRT real que você usa.

## Comandos para reproduzir

```powershell
cd C:\Users\DUARDIN\ApolloCut
npm install
npm run test:all
```

Para abrir o app:

```powershell
Start-Process "C:\Users\DUARDIN\ApolloCut\index.html"
```

Para ver o estado do git:

```powershell
git log --oneline -5
git tag --list
git status --short
```

## Como voltar atrás

- Estado recebido: tag `checkpoint-00-base`.
- Correções de legendas: tag `checkpoint-01-legendas`.
- Correções de tema: tag `checkpoint-02-tema`.
- Branch da noite: `noite/aprimoramento`.

Exemplo para voltar ao estado recebido:

```powershell
git switch --detach checkpoint-00-base
```

Não fiz push, não reescrevi histórico, não usei reset hard nem clean.
