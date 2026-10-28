const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));
  
  const fileUrl = 'file://' + process.cwd().replace(/\\/g, '/') + '/dist/index.html';
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');
  
  // Wait a bit for initialization
  await page.waitForTimeout(1000);
  
  // Check state
  const debug = await page.evaluate(() => {
    const opening = document.getElementById('opening');
    const landing = document.getElementById('landing');
    const openingSkip = document.getElementById('openingSkip');
    
    return {
      openingHidden: opening?.hidden,
      landingHidden: landing?.hidden,
      openingAriaHidden: opening?.getAttribute('aria-hidden'),
      landingStyle: landing?.style.cssText,
      openingClassList: opening?.className,
      landingClassList: landing?.className,
    };
  });
  console.log('Debug:', JSON.stringify(debug, null, 2));
  
  // Check if window.ApolloCut exists (IIFE global)
  const globalCheck = await page.evaluate(() => {
    return {
      hasApolloCut: typeof window.ApolloCut !== 'undefined',
      apolloCutKeys: window.ApolloCut ? Object.keys(window.ApolloCut) : null,
    };
  });
  console.log('Global check:', JSON.stringify(globalCheck, null, 2));
  
  await browser.close();
})().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});