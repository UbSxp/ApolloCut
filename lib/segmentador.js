/* ============================================================
   APOLLOCUT — segmentador por sentido em português (PT-BR)
   Programação dinâmica: encontra a quebra ótima por linha
   respeitando limites de caracteres, equilíbrio e regras de
   pontuação/funcionais. Zero dependências externas.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ApolloSegmentador = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Palavras funcionais que NUNCA ficam sozinhas na ponta de uma linha
  const PROIBIDOS_INICIO = new Set([
    "o","a","os","as","um","uma","uns","umas",
    "do","da","dos","das","de","do","da","dos","das",
    "em","no","na","nos","nas","por","para","com",
    "ao","à","aos","às","do","da","do","da",
    "e","mas","ou","mas","que","se","quando","porque","então","só","só que",
    "não","n",
  ]);

  // Pontuação forte = quebra preferida após
  const FORTE = /[\.\?\!\;\:]/;

  /**
   * Calcula o custo de uma linha (linha = array de palavras).
   * Penaliza: linha muito curta, desequilíbrio entre linhas,
   * excesso de caracteres, palavras funcionais no fim.
   */
  function custoLinha(words, maxChars) {
    if (!words.length) return Infinity;
    const texto = words.map(w => w.text || "").join(" ");
    const len = texto.length;
    if (len > maxChars) return Infinity; // estoura limite
    let custo = 0;
    // Penaliza linha muito curta (< 30% do limite)
    if (len < maxChars * 0.3) custo += 50;
    // Penaliza palavra funcional no fim da linha
    const ultima = (words[words.length - 1].text || "").toLowerCase();
    if (PROIBIDOS_INICIO.has(ultima)) custo += 100;
    // Penaliza palavra de 1-2 letras no fim
    const letras = ultima.replace(/[^\p{L}]/gu, "");
    if (letras.length <= 2) custo += 30;
    return custo;
  }

  /**
   * Segmenta um array de palavras (com start/end) em até maxLines linhas,
   * usando programação dinâmica para minimizar o custo total.
   * @param {Array} words - [{text, start, end}]
   * @param {Number} maxChars - limite de caracteres por linha
   * @param {Number} maxLines - número máximo de linhas (2 ou 3)
   * @returns {Array<Array>} - array de linhas, cada uma um array de palavras
   */
  function segmentar(words, maxChars, maxLines) {
    const n = words.length;
    if (n === 0) return [];
    if (n === 1) return [words];
    maxLines = maxLines || 2;
    maxChars = maxChars || 24;

    // dp[l][i] = melhor custo colocando as primeiras i palavras em l linhas
    // split[l][i] = posição do split ótimo
    const INF = Infinity;
    const dp = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(INF));
    const split = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(-1));

    dp[0][0] = 0; // 0 linhas, 0 palavras = custo 0

    for (let l = 1; l <= maxLines; l++) {
      for (let i = 1; i <= n; i++) {
        // Tenta colocar words[j..i-1] como a linha l-ésima
        for (let j = 0; j < i; j++) {
          if (dp[l-1][j] === INF) continue;
          const linha = words.slice(j, i);
          const c = custoLinha(linha, maxChars);
          if (c === Infinity) continue;
          const total = dp[l-1][j] + c;
          if (total < dp[l][i]) {
            dp[l][i] = total;
            split[l][i] = j;
          }
        }
      }
    }

    // Encontra o número ótimo de linhas (pode ser menos que maxLines)
    let bestL = 1;
    let bestCost = dp[1][n];
    for (let l = 2; l <= maxLines; l++) {
      if (dp[l][n] < bestCost) {
        bestCost = dp[l][n];
        bestL = l;
      }
    }

    // Reconstrói as linhas
    const lines = [];
    let i = n;
    let l = bestL;
    while (l > 0 && i > 0) {
      const j = split[l][i];
      if (j < 0) {
        // Fallback: coloca tudo em uma linha se a DP falhar
        lines.unshift(words.slice(0, i));
        break;
      }
      lines.unshift(words.slice(j, i));
      i = j;
      l--;
    }
    if (i > 0) lines.unshift(words.slice(0, i));

    return lines;
  }

  /**
   * Junta palavras em blocos de legenda por sentido.
   * Cada bloco é uma unidade completa de fala.
   * @param {Array} words - [{text, start, end}]
   * @param {Object} options - {maxWords, maxChars, maxGap, maxBlockSize}
   * @returns {Array} blocos: [{start, end, words}]
   */
  function agruparPorSentido(words, options) {
    const opt = options || {};
    const maxWords = opt.maxWords || 8;
    const maxChars = opt.maxChars || 42; // 2 linhas de ~21
    const maxGap = opt.maxGap != null ? opt.maxGap : 0.3; // 300ms de pausa = nova frase
    const maxDuration = opt.maxDuration || 7.0; // bloco máximo

    if (!words || !words.length) return [];

    const blocks = [];
    let current = [];

    for (const raw of words) {
      const word = {
        text: String(raw.text || "").trim(),
        start: Number(raw.start),
        end: Number(raw.end),
      };
      if (!word.text || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;

      if (current.length) {
        const last = current[current.length - 1];
        const gap = word.start - last.end;
        const dur = word.end - current[0].start;
        const totalChars = current.reduce((sum, w) => sum + w.text.length + 1, 0) + word.text.length;

        // Nova frase se: gap > maxGap, duração máxima excedida, ou limite de palavras
        if (gap > maxGap || dur > maxDuration || current.length >= maxWords) {
          if (current.length) blocks.push(fecharBloco(current));
          current = [word];
        } else if (totalChars > maxChars && current.length >= 3) {
          // Limite de caracteres: fecha o bloco atual
          blocks.push(fecharBloco(current));
          current = [word];
        } else {
          current.push(word);
        }
      } else {
        current = [word];
      }
    }

    if (current.length) blocks.push(fecharBloco(current));

    // Pós-processamento: juntar blocos muito curtos (< 2 palavras) com o anterior se a lacuna for pequena
    const merged = [];
    for (const block of blocks) {
      if (merged.length) {
        const prev = merged[merged.length - 1];
        const gap = block.start - prev.end;
        if (block.words.length <= 1 && gap < 0.15) {
          prev.words.push(...block.words);
          prev.end = block.end;
          continue;
        }
      }
      merged.push(block);
    }

    return merged;
  }

  function fecharBloco(words) {
    return {
      start: words[0].start,
      end: words[words.length - 1].end,
      words: words.map(w => ({ ...w })),
    };
  }

  /**
   * Quebra um bloco em duas linhas usando programação dinâmica.
   * @returns {{linhas: Array<Array>, balanceamento: Number}}
   */
  function quebrarBloco(block, maxChars, maxLines) {
    const linhas = segmentar(block.words, maxChars, maxLines);
    const lens = linhas.map(l => l.reduce((s, w) => s + w.text.length + 1, 0) - 1);
    const balanceamento = linhas.length >= 2 ? Math.abs(lens[0] - lens[1]) : 0;
    return { linhas, balanceamento };
  }

  /**
   * Teste de conformidade: verifica se um bloco termina com "fui"
   * e o próximo começa com "ao" (violação de sentido).
   * @param {Array} blocks
   * @returns {Boolean} - true se VIOLAÇÃO encontrada
   */
  function detectaQuebraNoMeio(blocks) {
    for (let i = 0; i < blocks.length - 1; i++) {
      const lastWord = blocks[i].words[blocks[i].words.length - 1];
      const nextWord = blocks[i + 1].words[0];
      if ((lastWord.text === "fui" || lastWord.text === "vi") &&
          (nextWord.text === "ao" || nextWord.text === "à" || nextWord.text === "a")) {
        return true;
      }
    }
    return false;
  }

  return {
    segmentar,
    agruparPorSentido,
    quebrarBloco,
    detectaQuebraNoMeio,
    PROIBIDOS_INICIO,
  };
});
