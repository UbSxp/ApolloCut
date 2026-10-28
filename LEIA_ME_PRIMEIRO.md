# Leia-me primeiro

**Os quatro defeitos críticos estão corrigidos e testados no navegador de verdade.** Tema, processamento, edição/exportação e transcrição funcionam; a suíte de ponta a ponta fecha em **14/14 APROVADO**.

## Como abrir

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou mais nova).
2. Dê dois cliques em **`INICIAR.bat`**.
3. O navegador abre em `http://localhost:4173`. Feche a janela preta para encerrar.

Na primeira vez o `INICIAR.bat` roda `npm install` (se faltar) e gera o Whisper local em `vendor/` (~1 min).

> **Não abra o `index.html` com dois cliques.** Em `file://` o navegador bloqueia módulos ES, workers, WebAssembly e a decodificação de áudio — nada funciona, e o app mostra um aviso explicando isso.

## Como testar

Dê dois cliques em **`TESTAR.bat`** (ou rode `npm run teste`). Ele:

- sobe o servidor sozinho se preciso;
- abre o Chromium via Playwright;
- roda as 6 verificações obrigatórias + 6 cenários de borda;
- imprime `APROVADO` ou `REPROVADO` e grava tudo em `docs/evidencias/` (capturas, `.webm` exportado, `.srt`, `.ass`, `resultado.json`, `transcricao.json`).

A primeira execução baixa o modelo do Whisper para o cache do navegador e demora alguns minutos.

## O que foi corrigido

| Defeito | Antes | Agora |
|---|---|---|
| Tema | botões sem handler | alternador e Dia/Noite/Automático aplicam, persistem e anunciam o estado |
| Processamento | botões presos em `disabled`, CSP bloqueava `blob:` | vídeo carrega, análise chega a 100% e gera cortes com miniaturas reais |
| Edição/exportação | `// For now, we'll just simulate the export` | marcar, cortar, dividir, apagar, desfazer; exporta WebM real via canvas + MediaRecorder; SRT/ASS |
| Transcrição | `Failed to resolve module specifier "@huggingface/transformers"` | Whisper local em Web Worker, áudio mono 16 kHz, legendas sincronizadas |

Detalhes de reprodução, erro exato e arquivo:linha estão em [`DIAGNOSTICO.md`](DIAGNOSTICO.md). O funcionamento interno está em [`docs/COMO_FUNCIONA_O_PROCESSAMENTO.md`](docs/COMO_FUNCIONA_O_PROCESSAMENTO.md).

## Limitações reais (não são bugs escondidos)

- **Tempo por palavra é aproximado.** O modelo q8 do Whisper não traz atenções cruzadas, então `return_timestamps: 'word'` é impossível. O app usa os tempos de bloco e distribui as palavras por peso — os tempos são monotônicos e não se sobrepõem, mas não são exatos por palavra.
- **A transcrição usa wasm/q8, não WebGPU.** O painel de diagnóstico detecta WebGPU, mas rodar em fp32 exigiria baixar centenas de MB; o caminho padrão é CPU com 1–2 threads.
- **A exportação gera WebM (VP9/VP8 + Opus), não MP4.** O `MediaRecorder` do Chromium não grava H.264. O arquivo abre em qualquer editor e no navegador.
- **O Whisper erra palavras parecidas.** "Almocei ontem" sai como "Ao no sei-on-tem" em algumas execuções; é limitação do modelo pequeno, não do app.
- **A exportação opera no corte ativo**, coerente com "o corte final" — não concatena todos os cortes.
- **`vendor/` não vai para o git** (50 MB de wasm). `INICIAR.bat` e `npm run vendor` regeneram.

## Atalhos

- `Ctrl+Shift+D` — painel de Diagnóstico (modo de abertura, `crossOriginIsolated`, WebGPU, codecs, memória, últimos erros, cortes, legendas).
- No rodapé do estúdio há o botão **Diagnóstico** com "Copiar relatório".
