# ApolloCut — Sistema de Design Apolo

Versão: 1.0  
Data: 22/10/2026  
Autor: redesign de produto e front-end  
Escopo: camada visual, temas, tipografia, marca, ícones, movimento, estados e acessibilidade. A lógica de vídeo, áudio, legendas e exportação permanece intacta.

## 1. Conceito

**Apolo, o sol que corta.**

O ApolloCut é um ateliê de luz: o criador entrega um filme bruto, o app lê os sinais visuais e sonoros e devolve trechos certeiros, como um raio de sol que atravessa a sala e encontra o ponto exato. A interface não é um templo cenográfico; é uma bancada de trabalho com proporção, silêncio e um fio de ouro.

O conceito se traduz em decisões concretas:

- **Sol e luz:** o que está ativo, pronto ou aprovado recebe calor dourado; o resto recua para tinta e mármore.
- **Carro do sol:** progresso em arco ou linha com um pequeno sol percorrendo o trajeto.
- **Lira:** áudio, transcrição e processamento com cordas que vibram em baixa amplitude.
- **Arco e flecha:** precisão do corte, com um traço de luz na linha do tempo.
- **Louro:** sucesso, melhor corte e exportação concluída.
- **Colunas e frontões:** estrutura, painéis e hierarquia.
- **Meandro:** divisores finos, nunca como padrão pesado.
- **Oráculo:** sugestões automáticas com microcopy elegante, sem prometer magia.
- **Musas:** legendas e tipografia.
- **Aurora:** transição entre os temas Dia de Apolo e Noite em Delfos.

## 2. Temas e paleta

Os valores foram medidos com a fórmula WCAG 2.x (luminância relativa). Contraste mínimo: 4.5:1 para texto normal, 3:1 para texto grande e componentes.

### 2.1 Dia de Apolo (claro)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#F6EFE3` | fundo de mármore quente |
| `--bg-elevated` | `#FBF7EF` | fundo de seção |
| `--surface` | `#FFFDF8` | cartões e painéis |
| `--surface-2` | `#F0E7D8` | superfície secundária |
| `--ink` | `#1B2430` | texto principal |
| `--ink-2` | `#33404D` | texto secundário |
| `--muted` | `#5E6A73` | texto de apoio |
| `--gold` | `#8F652A` | ação e destaque textual |
| `--gold-bright` | `#C79A4B` | ornamento, nunca texto pequeno |
| `--aegean` | `#2E6470` | informação e foco |
| `--laurel` | `#4E6B4A` | sucesso |
| `--terracotta` | `#A95434` | atenção |
| `--error` | `#9E3F33` | erro |
| `--line` | `rgba(27,36,48,.14)` | divisores |
| `--line-strong` | `rgba(27,36,48,.28)` | bordas de ênfase |

Contrastes medidos:

| Par | Razão |
|---|---|
| ink / bg | 13.70 |
| ink-2 / bg | 9.27 |
| muted / bg | 4.85 |
| gold / bg | 4.52 |
| gold / surface | 5.08 |
| aegean / bg | 5.79 |
| laurel / bg | 5.21 |
| terracotta / bg | 4.59 |
| error / bg | 5.72 |

### 2.2 Noite em Delfos (escuro)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0C1420` | azul-noite com índigo |
| `--bg-elevated` | `#111B29` | fundo de seção |
| `--surface` | `#162233` | cartões e painéis |
| `--surface-2` | `#1D2B3D` | superfície secundária |
| `--ink` | `#F4EBDD` | marfim |
| `--ink-2` | `#D8CBB8` | texto secundário |
| `--muted` | `#A9B2BC` | texto de apoio |
| `--gold` | `#E0BE78` | ação e destaque |
| `--gold-bright` | `#F0D49A` | ornamento |
| `--aegean` | `#7FB6C0` | informação e foco |
| `--laurel` | `#9DBB91` | sucesso |
| `--terracotta` | `#D98A68` | atenção |
| `--error` | `#E08A7D` | erro |
| `--line` | `rgba(244,235,221,.14)` | divisores |
| `--line-strong` | `rgba(244,235,221,.28)` | bordas de ênfase |

Contrastes medidos:

| Par | Razão |
|---|---|
| ink / bg | 15.64 |
| ink-2 / bg | 11.57 |
| muted / bg | 8.61 |
| gold / bg | 10.39 |
| gold / surface | 9.01 |
| aegean / bg | 8.23 |
| laurel / bg | 8.76 |
| terracotta / bg | 6.85 |
| error / bg | 7.13 |

### 2.3 Gradientes

- **Aurora:** `linear-gradient(135deg, #F3D9BD 0%, #F8E9CF 42%, #DCE9E5 100%)` no claro; no escuro, `linear-gradient(135deg, #2A2130 0%, #172436 55%, #0C1420 100%)`.
- **Halo solar:** `radial-gradient(circle, rgba(199,154,75,.20), transparent 70%)`.
- **Véu de modal:** `rgba(12,20,32,.62)` no claro; `rgba(4,8,14,.72)` no escuro.

## 3. Tipografia

Fontes locais, licença SIL Open Font License 1.1:

- **Cormorant Garamond** — display, títulos, citações e números romanos. Pesos 400, 600 e 700; itálico 400.
- **Manrope** — interface, rótulos, botões, metadados e números tabulares. Pesos 400, 500 e 700.
- **Cinzel** — apenas eyebrows, selos e micro-rótulos rituais. Peso 500.

Arquivos em `assets/fonts/`, com os textos de licença `cinzel-OFL.txt`, `cormorantgaramond-OFL.txt` e `manrope-OFL.txt`.

Escala modular (base 16, razão 1.25):

| Papel | Tamanho | Entrelinha | Peso |
|---|---|---|---|
| Display | 64–88 px | 0.98–1.05 | 400/600 |
| H1 | 44–64 px | 1.02 | 400 |
| H2 | 32–40 px | 1.08 | 600 |
| H3 | 22–28 px | 1.15 | 600 |
| Corpo | 16 px | 1.6 | 400 |
| Corpo pequeno | 14 px | 1.55 | 400/500 |
| Rótulo | 12–13 px | 1.4 | 600/700 |
| Micro | 11 px | 1.35 | 700, caixa alta e tracking 0.12em |

Números de tempo, duração, porcentagem e contadores usam `font-variant-numeric: tabular-nums`.

## 4. Espaço, forma e profundidade

- Escala de espaço: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96.
- Raios: 8 px (controles), 12 px (campos), 16 px (cartões), 20 px (modais), 999 px (pílulas).
- Bordas: 1 px em `--line`, 1.5 px em `--line-strong`; nunca mais de duas molduras concêntricas.
- Sombras: longas, difusas e tingidas. Claro: `0 24px 60px -32px rgba(27,36,48,.28)`. Escuro: `0 30px 80px -40px rgba(0,0,0,.70)`.
- Textura: grão de papel a 3–4% no claro; no escuro, uma malha estelar quase invisível. Mármore em SVG apenas em superfícies grandes, com opacidade ≤ 0.05.
- Vidro fosco apenas em barras fixas e modais, com blur ≤ 12 px e fallback sólido.
- Meandro: divisores de 1 px com motivo desenhado em SVG, altura máxima de 12 px.
- Louro: apenas em sucesso, melhor corte e marca.
- Coluna: capitel no topo de painéis principais, em SVG de traço 1.25 px.

## 5. Marca e ícones

- Símbolo: sol de 12 raios com uma lira de três cordas no centro e um arco de louro discreto.
- Logotipo: símbolo + “ApolloCut” em Cormorant Garamond 600, com “ateliê de cortes” em Manrope 500.
- Versões: símbolo claro/escuro, logotipo claro/escuro, ícone 16/32/256.
- Arquivos em `assets/brand/`.
- Ícones: família própria de 24×24, traço 1.6, cantos arredondados, mesmo peso óptico. Sprite inline em `index.html` e arquivo `assets/icons.svg` para reutilização.
- Ícones obrigatórios: importar, cortar, dividir, legenda, áudio, exportar, configurações, desfazer, refazer, play, pausa, excluir, sucesso, erro, aviso, sol, lua, fechar, chevron, mais, download, copiar, oráculo, louro, lira, filme, relógio, foco, proporção, paleta, volume.

## 6. Movimento

Curvas:

- Entrada: `cubic-bezier(.22, 1, .36, 1)`.
- Saída: `cubic-bezier(.4, 0, .2, 1)`.
- Ambiente: `linear` apenas em rotações contínuas.
- Micro: `cubic-bezier(.2, .8, .2, 1)`.

Catálogo:

| Movimento | Duração | Curva | Função |
|---|---|---|---|
| Abertura do sol | 1200–1500 ms | entrada | marca e boas-vindas; pulável |
| Fade/rise de tela | 320–480 ms | entrada | continuidade |
| Hover de botão | 140–180 ms | micro | feedback |
| Pressão de botão | 120 ms | saída | afundamento 1–2 px |
| Foco visível | 160 ms | micro | acessibilidade |
| Troca de tema | 500–700 ms | entrada | círculo de aurora |
| Drag sobre importação | 180–240 ms | micro | borda e halo |
| Cards do oráculo | 360–520 ms, stagger 40 ms | entrada | cascata |
| Barra de progresso | 200 ms | linear | progresso real |
| Sol da linha do tempo | 120 ms | micro | playhead |
| Sucesso com louro | 900–1100 ms | entrada | celebração contida |
| Erro | 180–220 ms | saída | vibração de 2 px |
| Toast | 220–280 ms | entrada | feedback |
| Ambiente solar | 60–120 s | linear | fundo vivo |

Regras:

- Animar apenas `transform`, `opacity` e filtros leves.
- `prefers-reduced-motion: reduce` desliga ambiente, abertura, stagger e vibração; mantém fades de 120 ms.
- Durante análise, transcrição e exportação, o body recebe `is-processing` e o ambiente pausa.
- Nenhuma animação pode bloquear a thread principal durante o processamento de vídeo.

## 7. Inventário da Fase 0

Telas e estados atuais:

- Landing: hero, ofícios, método, manifesto, planos, dúvidas, fechamento, rodapé.
- Estúdio: cabeçalho, palco 9:16, controles, abas Cena / Legendas / Publicar, lista de cortes.
- Modais: análise, Whisper, capa, exportação, ficha.
- Estados: vazio de importação, arquivo carregado, análise em andamento, cortes prontos, sem legendas, SRT alinhado, Whisper em andamento/concluído/erro, capa carregando/pronta, exportação em andamento/concluída/cancelada/erro, ficha, toasts, tema claro/escuro, mobile.
- Componentes: header, nav, botão primário/secundário/linha/ícone, campo, slider, seletor, cartão, painel, modal, toast, barra de progresso, stepper, badge, tooltip, player, linha do tempo, cards de corte, estilos de legenda, seletor de proporção, capa, ficha, exportação.

Dores encontradas na Fase 0:

- Contraste insuficiente em textos de apoio e features no mobile.
- Excesso de toasts simultâneos e sobreposição com painéis.
- Hierarquia de ação contraditória entre stepper, abas e CTA.
- Prévia de legenda que não representa o resultado exportado.
- Tema escuro com pouca elevação entre canvas, painel e modal.
- Microtipografia de 6–9 px e densidade excessiva.
- Estados de sucesso e erro visualmente parecidos.
- Ornamentos e vocabulário em excesso para pouca função.
- Mobile sem prova visual do estúdio.
- Fontes carregadas por CDN e tema sem alternância manual.

## 8. Acessibilidade

- Contraste AA em todos os pares; valores medidos acima.
- Foco visível de 2 px dourado + halo de 4 px, em todos os interativos.
- Navegação por teclado: skip link, ordem lógica, Escape fecha modais, setas e espaço no player.
- Alvos de clique ≥ 40 px.
- Rótulos acessíveis em ícones e botões.
- Nada transmitido só por cor: estados têm texto e ícone.
- `prefers-reduced-motion` obrigatório e testado.
- Escala de fonte respeitando o sistema; nenhum texto essencial abaixo de 12 px.
- Foco preso em modais e retorno ao elemento de origem.

## 9. Plano de execução

1. Tokens, temas, fontes locais e base tipográfica.
2. Marca, favicon e sprite de ícones.
3. Componentes base: botão, campo, cartão, painel, modal, toast, interruptor, seletor, progresso, tooltip.
4. Landing: hero, importação, ofícios, método, planos, dúvidas, fechamento.
5. Estúdio: palco, player, rail, abas, cortes, legendas, publicação.
6. Modais: análise, Whisper, capa, ficha, exportação, configurações.
7. Movimento: feedback, transições, oráculo, sucesso, ambiente, tema.
8. Estados vazios, erro e carregamento.
9. Responsividade e acessibilidade.
10. Verificação, capturas depois, medições, relatório e commits.

## 10. Suposições e não bloqueantes

- O produto continua 100% local e sem backend.
- Não haverá troca de framework nem dependência pesada.
- O nome ApolloCut permanece; nomes alternativos ficam apenas como sugestão no relatório.
- O tema seguirá a preferência do sistema na primeira visita e permitirá alternância manual persistida.
- O som será opcional, desligado por padrão e sintetizado localmente, sem arquivo externo.
- Projetos recentes serão registrados apenas como metadados locais (nome, duração, data); o arquivo de vídeo continua sendo escolhido pelo usuário.
- Nenhuma pergunta bloqueante: o escopo visual e funcional está claro.
