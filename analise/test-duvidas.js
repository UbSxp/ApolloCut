const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE_URL = 'file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas';
const LOCAL_URL = 'http://localhost:8080/index.html#duvidas';
const OUT_DIR = 'C:\\Users\\DUARDIN\\ApolloCut\\analise\\antes';

const viewports = [
  { name: 'mobile', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'large', width: 1920, height: 1080 },
];

const themes = ['light', 'dark'];

async function captureScreenshots(page, prefix) {
  for (const vp of viewports) {
    for (const theme of themes) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      
      // Set theme
      await page.evaluate((t) => {
        const html = document.documentElement;
        html.dataset.theme = t;
        html.dataset.themePref = t;
      }, theme);
      
      await page.waitForTimeout(300);
      
      // Scroll to #duvidas
      await page.evaluate(() => {
        const el = document.getElementById('duvidas');
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
      await page.waitForTimeout(200);
      
      const filename = `${prefix}-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, filename), fullPage: true });
      console.log(`Captured: ${filename}`);
    }
  }
  
  // Also capture just the FAQ section at desktop light
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const html = document.documentElement;
    html.dataset.theme = 'light';
    html.dataset.themePref = 'light';
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const el = document.getElementById('duvidas');
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
  });
  await page.waitForTimeout(200);
  
  const faqSection = await page.$('#duvidas');
  if (faqSection) {
    await faqSection.screenshot({ path: path.join(OUT_DIR, 'faq-section-desktop-light.png') });
    console.log('Captured: faq-section-desktop-light.png');
  }
}

async function testNavigation(page) {
  console.log('\n--- Testing Navigation ---');
  
  // Test 1: Direct anchor navigation
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  
  const scrolled = await page.evaluate(() => {
    const el = document.getElementById('duvidas');
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, visible: rect.top < window.innerHeight && rect.bottom > 0 };
  });
  console.log('Direct anchor scroll:', scrolled);
  
  // Test 2: Click nav link
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.click('nav a[href="#duvidas"]');
  await page.waitForTimeout(500);
  
  const afterClick = await page.evaluate(() => {
    const el = document.getElementById('duvidas');
    const rect = el.getBoundingClientRect();
    return { top: rect.top, visible: rect.top < window.innerHeight && rect.bottom > 0 };
  });
  console.log('After nav click:', afterClick);
  
  // Test 3: Footer link
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.click('footer a[href="#duvidas"]');
  await page.waitForTimeout(500);
  
  const afterFooterClick = await page.evaluate(() => {
    const el = document.getElementById('duvidas');
    const rect = el.getBoundingClientRect();
    return { top: rect.top, visible: rect.top < window.innerHeight && rect.bottom > 0 };
  });
  console.log('After footer click:', afterFooterClick);
}

async function testAccordion(page) {
  console.log('\n--- Testing Accordion ---');
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  
  const details = await page.$$('#duvidas details');
  console.log(`Found ${details.length} questions`);
  
  for (let i = 0; i < details.length; i++) {
    const summary = await details[i].$('summary');
    const isOpen = await details[i].evaluate(el => el.open);
    console.log(`Q${i+1}: open=${isOpen}`);
    
    // Test click
    await summary.click();
    await page.waitForTimeout(200);
    const afterClick = await details[i].evaluate(el => el.open);
    console.log(`  After click: open=${afterClick}`);
  }
}

async function testKeyboardNavigation(page) {
  console.log('\n--- Testing Keyboard Navigation ---');
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  
  // Tab to first summary
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  let focused = await page.evaluate(() => document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '') + (document.activeElement.className ? '.' + document.activeElement.className : ''));
  console.log('After 1st Tab:', focused);
  
  // Test Enter to open
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const firstOpen = await page.evaluate(() => document.querySelector('#duvidas details').open);
  console.log('After Enter on first:', firstOpen);
  
  // Test Space to close
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const firstClosed = await page.evaluate(() => document.querySelector('#duvidas details').open);
  console.log('After Space on first:', firstClosed);
}

async function testSearch(page) {
  console.log('\n--- Testing Search ---');
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  
  const searchInput = await page.$('#faqSearch');
  const details = await page.$$('#duvidas details');
  
  // Test search for "servidor"
  await searchInput.fill('servidor');
  await page.waitForTimeout(200);
  
  const visible = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details:not([hidden])');
    return items.length;
  });
  console.log(`Search "servidor": ${visible} visible (expected 1)`);
  
  // Test search for "legendas" - matches 3 questions (legendas automáticas, arquivo final, editar vídeo)
  await searchInput.fill('legendas');
  await page.waitForTimeout(200);
  
  const visible2 = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details:not([hidden])');
    return items.length;
  });
  console.log(`Search "legendas": ${visible2} visible (expected 3)`);
  
  // Test search with no results
  await searchInput.fill('xyz123');
  await page.waitForTimeout(200);
  
  const visible3 = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details:not([hidden])');
    const noResults = document.querySelector('.faq-no-results');
    return { visible: items.length, hasNoResults: !!noResults };
  });
  console.log(`Search "xyz123": ${visible3.visible} visible, noResults: ${visible3.hasNoResults}`);
  
  // Clear search
  const clearBtn = await page.$('.faq-search-clear');
  await clearBtn.click();
  await page.waitForTimeout(200);
  
  const visible4 = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details:not([hidden])');
    return items.length;
  });
  console.log(`After clear: ${visible4} visible (expected 7)`);
}

async function testCategories(page) {
  console.log('\n--- Testing Categories ---');
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  
  // Check categories are rendered
  const categories = await page.$$('.faq-category');
  console.log(`Categories found: ${categories.length} (expected 8: Todas + 7 categories)`);
  
  // Click "privacidade" category
  const privBtn = await page.$('.faq-category[data-category="privacidade"]');
  await privBtn.click();
  await page.waitForTimeout(200);
  
  const visible = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details:not([hidden])');
    return items.length;
  });
  console.log(`Category "privacidade": ${visible} visible (expected 1)`);
  
  // Click "Todas"
  const allBtn = await page.$('.faq-category[data-category="all"]');
  await allBtn.click();
  await page.waitForTimeout(200);
  
  const visible2 = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details:not([hidden])');
    return items.length;
  });
  console.log(`Category "Todas": ${visible2} visible (expected 7)`);
}

async function testExpandCollapse(page) {
  console.log('\n--- Testing Expand/Collapse All ---');
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  
  // Expand all
  const expandBtn = await page.$('#faqExpandAll');
  await expandBtn.click();
  await page.waitForTimeout(200);
  
  const openCount = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details[open]');
    return items.length;
  });
  console.log(`After expand all: ${openCount} open (expected 7)`);
  
  // Collapse all
  const collapseBtn = await page.$('#faqCollapseAll');
  await collapseBtn.click();
  await page.waitForTimeout(200);
  
  const openCount2 = await page.evaluate(() => {
    const items = document.querySelectorAll('#duvidas details[open]');
    return items.length;
  });
  console.log(`After collapse all: ${openCount2} open (expected 0)`);
}

async function testConsoleErrors(page) {
  console.log('\n--- Console Errors ---');
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto('file:///C:/Users/DUARDIN/ApolloCut/index.html#duvidas', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  
  console.log('Errors:', errors.length > 0 ? errors : 'None');
  return errors;
}

async function runAllTests() {
  console.log('=== Starting ApolloCut #duvidas Analysis ===\n');
  
  // Test with file:// protocol
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await testConsoleErrors(page);
  await testNavigation(page);
  await testAccordion(page);
  await testKeyboardNavigation(page);
  // await testReducedMotion(page); // Skipped in headless - known limitation
  await testSearch(page);
  await testCategories(page);
  await testExpandCollapse(page);
  
  await browser.close();
  
  // Now test with local server if available
  console.log('\n=== Testing with local server (if available) ===');
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  
  try {
    await page2.goto('http://localhost:8080/index.html#duvidas', { waitUntil: 'load', timeout: 10000 });
    await page2.waitForTimeout(500);
    await captureScreenshots(page2, 'http');
    await browser2.close();
    console.log('Local server tests passed');
  } catch (e) {
    console.log('Local server not available:', e.message);
    await browser2.close();
  }
  
  console.log('\n=== Analysis Complete ===');
}

runAllTests().catch(console.error);