const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  const fileUrl = 'file://' + process.cwd().replace(/\\/g, '/') + '/dist/index.html';
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');
  
  // Check if showOpening ran by checking the state
  const debug = await page.evaluate(() => {
    const opening = document.getElementById('opening');
    const landing = document.getElementById('landing');
    const openingSkip = document.getElementById('openingSkip');
    
    return {
      openingExists: !!opening,
      landingExists: !!landing,
      openingSkipExists: !!openingSkip,
      openingHidden: opening?.hidden,
      landingHidden: landing?.hidden,
      openingAriaHidden: opening?.getAttribute('aria-hidden'),
      landingAriaHidden: landing?.getAttribute('aria-hidden'),
      openingClassList: opening?.className,
      landingClassList: landing?.className,
    };
  });
  console.log('Debug:', JSON.stringify(debug, null, 2));
  
  // Check if there are any click handlers on openingSkip
  const handlers = await page.evaluate(() => {
    const btn = document.getElementById('openingSkip');
    return {
      hasOnclick: !!btn?.onclick,
      clickListeners: btn ? getEventListeners(btn).click?.length || 0 : 0,
    };
  });
  console.log('Handlers:', JSON.stringify(handlers, null, 2));
  
  await browser.close();
})().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});