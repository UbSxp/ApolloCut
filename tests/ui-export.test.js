"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..");
const APP = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const VIDEO = path.join(ROOT, "tests", "fixtures", "sample.mp4");
const SRT = path.join(ROOT, "tests", "fixtures", "teste.srt");
const DOWNLOAD = path.join(ROOT, "test-results", "export");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = fs.existsSync(EDGE) ? EDGE : CHROME;

(async () => {
  if (!fs.existsSync(executablePath)) throw new Error("Edge/Chrome não encontrado.");
  fs.rmSync(DOWNLOAD, { recursive: true, force: true });
  fs.mkdirSync(DOWNLOAD, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-first-run", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width: 1440, height: 950 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD, eventsEnabled: true });

  await page.goto(APP, { waitUntil: "load" });
  await page.evaluate(() => { document.getElementById("opening").hidden = true; });
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 8000 }), page.click("#openStudioBtn")]);
  await chooser.accept([VIDEO]);
  await page.waitForFunction(() => !document.getElementById("analyzeBtn").disabled, { timeout: 30000 });
  await page.evaluate(() => {
    const len = document.getElementById("lenRange");
    const count = document.getElementById("countRange");
    len.value = "10";
    count.value = "1";
    len.dispatchEvent(new Event("change", { bubbles: true }));
    count.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.click("#analyzeBtn");
  await page.waitForFunction(
    () => !document.getElementById("clipsSection").hidden && document.getElementById("analysisOverlay").hidden,
    { timeout: 120000 }
  );

  await page.evaluate(() => document.querySelector('[data-tab="captions"]').click());
  const [srtChooser] = await Promise.all([page.waitForFileChooser({ timeout: 8000 }), page.click("#importSrtBtn")]);
  await srtChooser.accept([SRT]);
  await page.waitForFunction(() => document.getElementById("captionStatusTitle").textContent.includes("SRT"), { timeout: 10000 });

  await page.evaluate(() => document.querySelector('[data-tab="publish"]').click());
  await page.click("#exportBtn");
  await page.waitForFunction(() => !document.getElementById("exportOverlay").hidden, { timeout: 10000 });
  assert.equal(await page.evaluate(() => document.getElementById("burnCaptions").checked), true);
  await page.click("#exportStart");
  await page.waitForFunction(() => !document.getElementById("exportResult").hidden, { timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const files = fs.readdirSync(DOWNLOAD).map((name) => {
    const data = fs.readFileSync(path.join(DOWNLOAD, name));
    return {
      name,
      bytes: data.length,
      ftyp: data.includes(Buffer.from("ftyp")),
      moov: data.includes(Buffer.from("moov")),
      avc1: data.includes(Buffer.from("avc1")),
      mp4a: data.includes(Buffer.from("mp4a")),
      webm: data.includes(Buffer.from("webm"))
    };
  });
  assert.equal(files.length, 1);
  assert.ok(files[0].bytes > 100000);
  assert.ok(files[0].ftyp || files[0].webm);
  assert.deepEqual(errors, []);
  console.log(`Exportação: ${files[0].name} (${files[0].bytes} bytes, mp4=${files[0].ftyp}, avc1=${files[0].avc1}, mp4a=${files[0].mp4a})`);
  await browser.close();
})().catch((error) => {
  console.error("FALHA", error);
  process.exit(1);
});
