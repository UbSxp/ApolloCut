/* ============================================================
   APOLLOCUT — utilidades puras de legendas
   Sem DOM, sem rede. Usado pelo app e pelos testes em Node.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ApolloCaptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HALLUCINATIONS = [
    /legendas?\s+(?:pela|da)\s+comunidade\s+amara(?:\.org)?/gi,
    /subtitles?\s+by\s+the\s+amara(?:\.org)?\s+community/gi,
    /obrigad[oa]\s+por\s+assistir/gi,
    /thanks?\s+for\s+watching/gi,
    /(?:se\s+)?inscreva-?se\s+(?:no|em\s+seu)\s+canal/gi,
    /n[ãa]o\s+se\s+esque[çc]a\s+de\s+(?:curtir|se\s+inscrever)/gi,
    /at[ée]\s+a\s+pr[óo]xima/gi,
    /tchau[!.]?/gi,
  ];

  const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    aacute: "á",
    agrave: "à",
    acirc: "â",
    atilde: "ã",
    auml: "ä",
    eacute: "é",
    egrave: "è",
    ecirc: "ê",
    euml: "ë",
    iacute: "í",
    igrave: "ì",
    icirc: "î",
    iuml: "ï",
    oacute: "ó",
    ograve: "ò",
    ocirc: "ô",
    otilde: "õ",
    ouml: "ö",
    uacute: "ú",
    ugrave: "ù",
    ucirc: "û",
    uuml: "ü",
    ccedil: "ç",
    ntilde: "ñ",
    Aacute: "Á",
    Agrave: "À",
    Acirc: "Â",
    Atilde: "Ã",
    Auml: "Ä",
    Eacute: "É",
    Egrave: "È",
    Ecirc: "Ê",
    Euml: "Ë",
    Iacute: "Í",
    Icirc: "Î",
    Iuml: "Ï",
    Oacute: "Ó",
    Ograve: "Ò",
    Ocirc: "Ô",
    Otilde: "Õ",
    Ouml: "Ö",
    Uacute: "Ú",
    Ucirc: "Û",
    Uuml: "Ü",
    Ccedil: "Ç",
    Ntilde: "Ñ",
  };

  function decodeEntities(text) {
    return String(text == null ? "" : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, body) => {
      if (body[0] === "#") {
        const hex = body[1] && body[1].toLowerCase() === "x";
        const value = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        return Number.isFinite(value) && value > 0 && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : all;
      }
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) return NAMED_ENTITIES[body];
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body.toLowerCase())
        ? NAMED_ENTITIES[body.toLowerCase()]
        : all;
    });
  }

  function parseTimecode(value) {
    const raw = String(value == null ? "" : value).trim().replace(",", ".");
    const match = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)$/);
    if (!match) return NaN;
    const h = Number(match[1] || 0);
    const m = Number(match[2]);
    const s = Number(match[3]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return NaN;
    if (m >= 60 || s >= 60) return NaN;
    return h * 3600 + m * 60 + s;
  }

  function cleanCueText(value) {
    return decodeEntities(
      String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\\N/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    ).replace(/\s+/g, " ").trim();
  }

  function parseSubtitles(raw) {
    const text = String(raw || "").replace(/^\uFEFF/, "").replace(/\r/g, "");
    const blocks = text.split(/\n{2,}/);
    const cues = [];
    const seen = new Set();
    for (const block of blocks) {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeIndex < 0) continue;
      const parts = lines[timeIndex].split("-->");
      if (parts.length < 2) continue;
      const start = parseTimecode(parts[0]);
      const end = parseTimecode(parts[1].trim().split(/\s+/)[0]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const clean = cleanCueText(lines.slice(timeIndex + 1).join(" "));
      if (!clean) continue;
      const key = `${start.toFixed(3)}|${end.toFixed(3)}|${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cues.push({ start, end, text: clean });
    }
    cues.sort((a, b) => a.start - b.start || a.end - b.end);
    return cues;
  }

  function sanitizeTranscript(value) {
    let text = String(value == null ? "" : value)
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\((?:m[úu]sica|music|aplausos|applause|risadas|laughter)\)/gi, " ")
      .replace(/[♪♫]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const pattern of HALLUCINATIONS) text = text.replace(pattern, " ");
    text = text
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, "")
      .trim();
    return /[\p{L}\p{N}]/u.test(text) ? text : "";
  }

  function wordWeight(word) {
    const letters = String(word).replace(/[^\p{L}\p{N}]/gu, "");
    return Math.max(2, letters.length || 1);
  }

  function distributeWords(text, start, end) {
    const rawWords = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!rawWords.length) return [];
    const from = Number(start);
    const to = Number(end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
    const weights = rawWords.map(wordWeight);
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    const duration = to - from;
    let acc = 0;
    return rawWords.map((word, index) => {
      const begin = from + (acc / total) * duration;
      acc += weights[index];
      const finish = from + (acc / total) * duration;
      return { text: word, start: begin, end: finish };
    });
  }

  function groupWords(words, options) {
    const maxWords = Math.max(1, (options && options.maxWords) || 4);
    const maxChars = Math.max(8, (options && options.maxChars) || 28);
    const maxGap = Math.max(0.4, (options && options.maxGap) || 0.9);
    const groups = [];
    let current = [];
    let chars = 0;

    const flush = () => {
      if (!current.length) return;
      const first = current[0];
      const last = current[current.length - 1];
      groups.push({
        start: first.start,
        end: last.end,
        words: current.map((word) => ({ ...word })),
      });
      current = [];
      chars = 0;
    };

    for (const raw of words || []) {
      const word = {
        text: String(raw.text || "").trim(),
        start: Number(raw.start),
        end: Number(raw.end),
      };
      if (!word.text || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;
      if (current.length) {
        const last = current[current.length - 1];
        const gap = word.start - last.end;
        if (current.length >= maxWords || chars + 1 + word.text.length > maxChars || gap > maxGap) {
          flush();
        }
      }
      if (!current.length) {
        current.push(word);
        chars = word.text.length;
      } else {
        current.push(word);
        chars += 1 + word.text.length;
      }
    }
    flush();
    return groups;
  }

  function wordsToGroups(text, start, end, options) {
    return groupWords(distributeWords(text, start, end), options);
  }

  function buildGroupsFromCues(cues, clipStart, clipEnd, options) {
    const from = Number(clipStart);
    const to = Number(clipEnd);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
    const groups = [];
    for (const cue of cues || []) {
      if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) continue;
      if (cue.end <= from + 0.001 || cue.start >= to - 0.001) continue;
      const words = distributeWords(cue.text, cue.start, cue.end);
      const clipped = [];
      for (const word of words) {
        const start = Math.max(word.start, from);
        const end = Math.min(word.end, to);
        if (end - start < 0.035) continue;
        clipped.push({ text: word.text, start: start - from, end: end - from });
      }
      if (clipped.length) groups.push(...groupWords(clipped, options));
    }
    groups.sort((a, b) => a.start - b.start || a.end - b.end);
    return groups;
  }

  function timestampRange(chunk) {
    if (!chunk || !Array.isArray(chunk.timestamp)) return null;
    const start = Number(chunk.timestamp[0]);
    const end = Number(chunk.timestamp[1]);
    if (!Number.isFinite(start)) return null;
    if (!Number.isFinite(end) || end <= start) return [start, start + 0.18];
    return [start, end];
  }

  function groupsFromWhisperChunks(chunks, options) {
    const opt = options || {};
    const timelineOffset = Number(opt.timelineOffset || 0);
    const clipLength = Number.isFinite(Number(opt.clipLength)) ? Number(opt.clipLength) : Infinity;
    const words = [];
    let allText = "";
    for (const chunk of chunks || []) {
      const clean = sanitizeTranscript(chunk && chunk.text);
      if (!clean) continue;
      allText = `${allText} ${clean}`.trim();
      const range = timestampRange(chunk);
      if (!range) continue;
      const start = Math.max(0, range[0] + timelineOffset);
      const end = Math.min(clipLength, range[1] + timelineOffset);
      if (end - start < 0.035) continue;
      words.push({ text: clean, start, end });
    }
    if (!words.length && allText && Number.isFinite(Number(opt.fallbackStart)) && Number.isFinite(Number(opt.fallbackEnd))) {
      return wordsToGroups(
        allText,
        Math.max(0, Number(opt.fallbackStart) + timelineOffset),
        Math.min(clipLength, Number(opt.fallbackEnd) + timelineOffset),
        opt
      );
    }
    return groupWords(words, opt);
  }

  return {
    decodeEntities,
    parseTimecode,
    cleanCueText,
    parseSubtitles,
    sanitizeTranscript,
    distributeWords,
    groupWords,
    wordsToGroups,
    buildGroupsFromCues,
    groupsFromWhisperChunks,
  };
});
