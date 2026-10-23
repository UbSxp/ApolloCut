"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..");
const APP = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = fs.existsSync(EDGE) ? EDGE : CHROME;

async function dismissOpening(page) {
  await page.evaluate(() => {
    const opening = document.getElementById("opening");
    if (opening) opening.hidden = true;
  });
}

(async () => {
  if (!fs.existsSync(executablePath)) {
    throw new Error("Edge/Chrome não encontrado para o teste de interface.");
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-first-run", "--allow-file-access-from-files"],
    defaultViewport: { width: 1440, height: 950 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.goto(APP, { waitUntil: "load" });
  await page.evaluate(() => {
    localStorage.setItem("apollocut.settings.v2", JSON.stringify({ theme: "auto", lang: "pt" }));
  });
  await page.reload({ waitUntil: "load" });
  await dismissOpening(page);

  const autoDark = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    pref: document.documentElement.dataset.themePref,
    meta: document.querySelector('meta[name="theme-color"]').content
  }));
  assert.equal(autoDark.theme, "dark");
  assert.equal(autoDark.pref, "auto");
  assert.equal(autoDark.meta.toLowerCase(), "#0c1420");

  await page.click(".js-theme");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const light = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    pref: document.documentElement.dataset.themePref,
    stored: JSON.parse(localStorage.getItem("apollocut.settings.v2")).theme,
    background: getComputedStyle(document.body).backgroundColor
  }));
  assert.equal(light.theme, "light");
  assert.equal(light.pref, "light");
  assert.equal(light.stored, "light");
  assert.notEqual(light.background, "rgb(12, 20, 32)");

  await page.reload({ waitUntil: "load" });
  await dismissOpening(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");

  await page.evaluate(() => document.querySelector(".js-settings").click());
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(await page.evaluate(() => document.getElementById("settingsOverlay").hidden), false);
  await page.evaluate(() => document.querySelector('[data-theme-choice="auto"]').click());
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-theme-choice="auto"]').classList.contains("active")),
    true
  );

  await page.select("#settingsLang", "en");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("apollocut.settings.v2")).lang), "en");
  await page.select("#settingsLang", "pt");
  await page.evaluate(() => document.getElementById("settingsDone").click());
  assert.equal(await page.evaluate(() => document.getElementById("settingsOverlay").hidden), true);

  assert.deepEqual(errors, []);
  console.log("Tema claro, escuro, automático, persistência e idioma: OK");
  await browser.close();
})().catch((error) => {
  console.error("FALHA", error);
  process.exit(1);
});
