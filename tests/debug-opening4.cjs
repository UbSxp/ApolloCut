const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  const fileUrl = 'file://' + process.cwd().replace(/\\/g, '/') + '/dist/index.html';
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Check initial state
  let debug = await page.evaluate(() => {
    const opening = document.getElementById('opening');
    const landing = document.getElementById('landing');
    const openingSkip = document.getElementById('openingSkip');
    return {
      openingHidden: opening?.hidden,
      landingHidden: landing?.hidden,
      openingAriaHidden: opening?.getAttribute('aria-hidden'),
      openingClassList: opening?.className,
      landingClassList: landing?.className,
      openingSkipExists: !!openingSkip,
    };
  });
  console.log('Initial:', JSON.stringify(debug, null, 2));
  
  // Click Continue button
  await page.click('#openingSkip');
  console.log('Clicked Continue');
  
  // Wait for animation
  await page.waitForTimeout(700);
  
  // Check final state
  debug = await page.evaluate(() => {
    const opening = document.getElementById('opening');
    const landing = document.getElementById('landing');
    return {
      openingHidden: opening?.hidden,
      landingHidden: landing?.hidden,
      openingAriaHidden: opening?.getAttribute('aria-hidden'),
      openingClassList: opening?.className,
      landingClassList: landing?.className,
    };
  });
  console.log('After click:', JSON.stringify(debug, null, 2));
  
  await browser.close();
})().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});