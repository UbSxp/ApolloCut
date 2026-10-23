"use strict";

const assert = require("node:assert/strict");
const C = require("../lib/captions.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("parseTimecode aceita vírgula, ponto e horas opcionais", () => {
  assert.equal(C.parseTimecode("00:00:01,250"), 1.25);
  assert.equal(C.parseTimecode("01:02:03.500"), 3723.5);
  assert.equal(C.parseTimecode("02:03"), 123);
  assert.ok(Number.isNaN(C.parseTimecode("99:99")));
});

test("parseSubtitles lê BOM, CRLF, entidades e tags", () => {
  const raw = "\uFEFF1\r\n00:00:01,000 --> 00:00:03,000\r\n<v Ana>Ol&aacute; &amp; adeus</v>\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n[Música]\r\n";
  const cues = C.parseSubtitles(raw);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1);
  assert.equal(cues[0].end, 3);
  assert.equal(cues[0].text, "Olá & adeus");
  assert.equal(cues[1].text, "[Música]");
});

test("distributeWords mantém ordem e cobre a duração", () => {
  const words = C.distributeWords("um dois três", 2, 5);
  assert.equal(words.length, 3);
  assert.equal(words[0].start, 2);
  assert.equal(words[2].end, 5);
  for (let i = 1; i < words.length; i += 1) {
    assert.ok(words[i].start >= words[i - 1].start);
    assert.ok(words[i].end >= words[i].start);
  }
});

test("buildGroupsFromCues descarta palavras anteriores ao início do corte", () => {
  const words = Array.from({ length: 12 }, (_, index) => `p${index + 1}`).join(" ");
  const groups = C.buildGroupsFromCues([{ start: 9, end: 15, text: words }], 10, 20);
  const flat = groups.flatMap((group) => group.words.map((word) => word.text));
  assert.ok(!flat.includes("p1"));
  assert.ok(!flat.includes("p2"));
  assert.ok(flat.includes("p3"));
  assert.equal(groups[0].start, 0);
});

test("buildGroupsFromCues apara palavras posteriores ao fim do corte", () => {
  const words = Array.from({ length: 10 }, (_, index) => `p${index + 1}`).join(" ");
  const groups = C.buildGroupsFromCues([{ start: 0, end: 10, text: words }], 0, 5.2);
  const flat = groups.flatMap((group) => group.words);
  assert.ok(flat.length > 0);
  assert.ok(flat.every((word) => word.start >= 0 && word.end <= 5.2));
  assert.ok(!flat.some((word) => word.text === "p7"));
});

test("groupsFromWhisperChunks usa timestamps reais e remove alucinação", () => {
  const chunks = [
    { text: "Olá", timestamp: [0, 0.4] },
    { text: "mundo", timestamp: [0.5, 0.9] },
    { text: "Legendas pela comunidade Amara.org", timestamp: [1.0, 1.5] },
    { text: "fim", timestamp: [2.0, 2.3] },
  ];
  const groups = C.groupsFromWhisperChunks(chunks, { timelineOffset: 10, clipLength: 20 });
  const flat = groups.flatMap((group) => group.words.map((word) => word.text));
  assert.deepEqual(flat, ["Olá", "mundo", "fim"]);
  assert.equal(groups[0].start, 10);
  assert.equal(groups[groups.length - 1].end, 12.3);
});

test("groupsFromWhisperChunks usa fallback quando não há timestamps", () => {
  const groups = C.groupsFromWhisperChunks(
    [{ text: "sem tempo" }],
    { fallbackStart: 2, fallbackEnd: 4, clipLength: 10 }
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].start, 2);
  assert.equal(groups[0].end, 4);
});

test("sanitizeTranscript não deixa texto vazio virar legenda", () => {
  assert.equal(C.sanitizeTranscript("Obrigado por assistir"), "");
  assert.equal(C.sanitizeTranscript("♪ ♪"), "");
  assert.equal(C.sanitizeTranscript("  uma   fala  "), "uma fala");
});

test("groupWords limita palavras e caracteres", () => {
  const words = C.distributeWords("a bb ccc dddd eeeee ffffff", 0, 6);
  const groups = C.groupWords(words, { maxWords: 2, maxChars: 12 });
  assert.ok(groups.length >= 3);
  assert.ok(groups.every((group) => group.words.length <= 2));
});

console.log(`\n${passed} testes de legendas passaram.`);
