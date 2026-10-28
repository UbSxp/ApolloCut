# Linha de base — qualidade das legendas

Medido em 2026-10-28 com o pipeline **anterior** a qualquer mudança
(`onnx-community/whisper-base`, WASM q8, timestamps por bloco +
`distributeWords`).

## Como medir

```bash
npm run servir            # em outro terminal (http://127.0.0.1:4173)
node tests/legendas/medir.mjs --label linha-de-base
node tests/legendas/medir.mjs --model tiny --label tiny
node tests/legendas/medir.mjs --only 01,11 --label rapido
```

O script abre o app de verdade no Chromium (Playwright), sobe cada clipe de
`tests/legendas/clipes/`, chama `whisper.startWhisper()` e lê as palavras
com tempos do evento `whisper:result`.

## Banco de clipes

12 clipes pt-BR (8,4 s a 38,6 s, 220 s no total), gerados com a voz local
`Microsoft Maria Desktop` (SAPI) em três velocidades. Cada clipe tem um
`.json` de referência com o texto correto, o início real de **cada palavra**
(`SpeakProgress`/`AudioPosition` do SAPI) e as janelas de silêncio.

| clipe | duração | o que testa |
|---|---:|---|
| 01-limpo-normal | 15,7 s | fala normal, 3 frases |
| 02-limpo-lento | 14,8 s | voz lenta, silêncios de 1,2 s |
| 03-rapido | 11,9 s | voz rápida (+5 no SAPI) |
| 04-numeros | 22,2 s | "trezentos e quarenta e cinco reais", "dia 15 de março" |
| 05-siglas | 18,4 s | CPF, CNPJ, PIX, IPVA, IRPF |
| 06-nomes-marcas | 15,4 s | Instagram, WhatsApp, Nubank, Petrobras, YouTube |
| 07-girias | 16,4 s | tá, tô, pra, né, cê, mó |
| 08-pausas | 12,0 s | pausas de 1,5 s entre orações |
| 09-ruido | 12,5 s | ruído rosa a −15 dB da fala |
| 10-musica | 12,1 s | acorde com tremolo a −15 dB da fala |
| 11-silencio | 10,1 s | 3 s de silêncio no início, 4 s no fim |
| 12-longo | 38,6 s | 6 frases, ~40 s |

## Resultado

| clipe | WER | CER | erro médio | p95 | alucinações | perdidas | ms/min |
|---|---:|---:|---:|---:|---:|---:|---:|
| 01-limpo-normal | 3,4% | 0,8% | 383 ms | 709 ms | 0 | 0 | 21592 |
| 02-limpo-lento | 0,0% | 0,0% | 671 ms | 1498 ms | 2 | 0 | 15759 |
| 03-rapido | 0,0% | 0,0% | 308 ms | 885 ms | 0 | 0 | 25651 |
| 04-numeros | 0,0% | 0,0% | 685 ms | 1498 ms | 0 | 0 | 13430 |
| 05-siglas | 6,3% | 2,5% | 308 ms | 763 ms | 0 | 0 | 17552 |
| 06-nomes-marcas | 13,8% | 6,8% | 199 ms | 371 ms | 0 | 1 | 18641 |
| 07-girias | 10,7% | 4,2% | 322 ms | 706 ms | 0 | 0 | 16709 |
| 08-pausas | 0,0% | 0,0% | 173 ms | 397 ms | 0 | 0 | 17011 |
| 09-ruido | 0,0% | 0,0% | 121 ms | 400 ms | 0 | 0 | 18397 |
| 10-musica | 0,0% | 0,0% | 357 ms | 1066 ms | 0 | 0 | 19077 |
| 11-silencio | 0,0% | 0,0% | 2095 ms | 3100 ms | 3 | 0 | 18752 |
| 12-longo | 6,9% | 1,0% | 443 ms | 1234 ms | 0 | 0 | 12904 |

**Resumo:** WER **4,3%** · CER **0,4%** · erro médio de tempo **505 ms** ·
p95 **3100 ms** · alucinações **5** · palavras perdidas **1** ·
**17 956 ms** de processamento por minuto de áudio.

## Leitura do resultado

- **Texto**: já é bom em áudio limpo (WER 0% em 7 dos 12 clipes). Os erros se
  concentram em **nome próprio e estrangeirismo** (`Nubank` → "no banquia",
  `story` → "história", `Cê` → "Se", `mó role` → "morro ali") e em **sigla**
  (`PIX` → "PXI", `IPVA` → "IPV"). Alvo do prompt de vocabulário e do modelo
  maior.
- **Tempo**: é a falha grave. `distributeWords` espalha as palavras
  uniformemente dentro do bloco do Whisper, então o erro cresce com o tamanho
  do bloco: 121 ms no melhor caso, 2 095 ms no clipe 11. Nenhum clipe atinge
  a meta de 100 ms.
- **Alucinações**: as 5 contadas em 02 e 11 são, na verdade, palavras reais
  com tempo deslocado para dentro do silêncio (efeito do mesmo
  `distributeWords`), não fala inventada. A métrica não distingue os dois
  casos; depois do timestamp por palavra o número deve cair para 0.
- **Custo**: ~18 s por minuto de áudio no WASM com o modelo base, incluindo
  carregamento do modelo a cada transcrição. Candidato a cache do pipeline no
  worker entre execuções.

## Metas

| métrica | meta | linha de base |
|---|---|---|
| WER (clipes limpos) | ≤ 10% | 4,3% (global), 13,8% no pior clipe |
| erro médio de tempo | < 100 ms | 505 ms |
| p95 de tempo | < 200 ms | 3100 ms |
| alucinações em silêncio | 0 | 5 |
