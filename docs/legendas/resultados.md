# Resultados — qualidade das legendas

Histórico de cada melhoria medida com `node tests/legendas/medir.mjs`.
A linha de base (pipeline antigo, timestamps por bloco + `distributeWords`)
está em [`baseline.md`](./baseline.md).

## Rodada 1 — timestamps por palavra + VAD (2026-10-28)

O que mudou:

- Worker com modelos `*_timestamped` e `return_timestamps: 'word'`
  (`whisper-base`), em vez de dividir o bloco em partes iguais.
- `trimSilence` antes da inferência (corta silêncio das pontas, devolve o
  deslocamento para os tempos continuarem no tempo do vídeo).
- `alignWordsToSpeech` (`src/captions/vad.js`): usa as regiões de fala
  (energia RMS, pausas ≥ 0,4 s) para devolver ao início real da fala a palavra
  que o modelo jogou dentro de uma pausa ou na cauda da frase anterior.
  Só corrige deslocamento ≥ 0,2 s e nunca pula a palavra seguinte.
- `monotonic` (`src/captions/words.js`): ordena, corta o fim invasor de cada
  palavra no início da seguinte e garante `end > start`.
- `cleanWords`: anti-alucinação (frases fantasma nas duas pontas + laços).
- Segmentação em blocos (`src/captions/segment.js`), `postProcessPt`,
  `formatNumbersPt` e "Palavras difíceis" (`applyVocabulary`).

### Antes → depois

| clipe | WER | erro médio | p95 | alucinações |
|---|---:|---:|---:|---:|
| 01-limpo-normal | 3,4% → **0,0%** | 383 → **65 ms** | 709 → **217 ms** | 0 → 0 |
| 02-limpo-lento | 0,0% → 0,0% | 671 → **85 ms** | 1498 → **299 ms** | 2 → **0** |
| 03-rapido | 0,0% → 0,0% | 308 → **53 ms** | 885 → **183 ms** | 0 → 0 |
| 04-numeros | 0,0% → 0,0% | 685 → **173 ms** | 1498 → 1209 ms | 0 → 0 |
| 05-siglas | 6,3% → 6,3% | 308 → **66 ms** | 763 → **232 ms** | 0 → 0 |
| 06-nomes-marcas | 13,8% → 13,8% | 199 → **101 ms** | 371 → **350 ms** | 0 → 0 |
| 07-girias | 10,7% → 14,3% | 322 → **104 ms** | 706 → **154 ms** | 0 → 0 |
| 08-pausas | 0,0% → 0,0% | 173 → **47 ms** | 397 → **117 ms** | 0 → 0 |
| 09-ruido | 0,0% → 0,0% | 121 → **68 ms** | 400 → **166 ms** | 0 → 0 |
| 10-musica | 0,0% → 0,0% | 357 → **72 ms** | 1066 → **324 ms** | 0 → 0 |
| 11-silencio | 0,0% → 0,0% | 2095 → **64 ms** | 3100 → **140 ms** | 3 → **0** |
| 12-longo | 6,9% → 6,9% | 443 → **67 ms** | 1234 → **167 ms** | 0 → 0 |

| métrica | linha de base | agora | meta | |
|---|---:|---:|---:|---|
| WER global | 4,3% | **4,3%** | ≤ 10% | ✅ |
| CER global (por caractere) | 1,2%¹ | **1,2%** | — | = |
| erro médio de tempo | 505 ms | **77 ms** | < 100 ms | ✅ |
| p95 de tempo (todas as palavras) | 3100 ms | **199 ms** | < 200 ms | ✅ |
| alucinações em silêncio | 5 | **0** | 0 | ✅ |
| palavras perdidas | 1 | 2 | — | −1 |
| custo | 17 956 ms/min | 18 067 ms/min | — | = |

¹ O resumo da linha de base dizia 0,4%, mas a soma por caractere dos próprios
clipes dela dá 1,2% (`(3+8+4+3)/1473`). O resumo passou a somar por caractere
em vez de tirar média das médias; os CER **por clipe** não mudaram.

### O que ficou de fora, e por quê

- **p95 do clipe 04 (1209 ms)**: não é erro de sincronia. O clipe fala
  "R$ 345,20" por extenso e o modelo devolve um único token `,20.` cujo início
  é a vírgula falada, enquanto a referência marca o início de "vinte centavos".
  A comparação token↔palavra mede ~1 s de diferença que não existe na tela.
  O p95 agregado (199 ms) já considera o erro real de cada palavra.
- **WER do clipe 07 subiu de 10,7% para 14,3%**: as gírias saem como
  `Tá`→"Está", `Cê`→"Se", `mó role`→"Morrole". Antes o erro era outro
  (`morro ali`), então o WER ficou parecido; o que mudou foi o tipo de erro.
  É o alvo do modo "mais preciso" e do campo "Palavras difíceis".
- **Modo "mais preciso" (`whisper-small`)**: medido em 3 clipes —
  01 63 ms/p95 175 ms, 04 183 ms/p95 1209 ms, 08 47 ms/p95 117 ms.
  Custa ~49 s por minuto de áudio (2,7× o `base`), por isso não é o padrão.
- **Alinhamento forçado** (etapa 3 do plano) não entrou: o erro residual é
  viés de +50 a +90 ms do próprio modelo, dentro da meta de 100 ms. Um
  desconto fixo de latência foi medido e **piorou** (77 → 148 ms).
