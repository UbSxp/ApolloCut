const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  const fileUrl = 'file://' + process.cwd().replace(/\\/g, '/') + '/dist/index.html';
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');
  
  // Check initial state
  const openingHidden = await page.evaluate(() => document.getElementById('opening').hidden);
  const landingHidden = await page.evaluate(() => document.getElementById('landing').hidden);
  console.log('Initial opening.hidden:', openingHidden);
  console.log('Initial landing.hidden:', landingHidden);
  
  // Check if showOpening was called
  const openingAriaHidden = await page.evaluate(() => document.getElementById('opening').getAttribute('aria-hidden'));
  console.log('Opening aria-hidden:', openingAriaHidden);
  
  // Click Continue button
  await page.click('#openingSkip');
  console.log('Clicked Continue button');
  
  // Wait for animation
  await page.waitForTimeout(700);
  
  // Check final state
  const finalOpeningHidden = await page.evaluate(() => document.getElementById('opening').hidden);
  const finalLandingHidden = await page.evaluate(() => document.getElementById('landing').hidden);
  console.log('Final opening.hidden:', finalOpeningHidden);
  console.log('Final landing.hidden:', finalLandingHidden);
  
  await browser.close();
  console.log('Test completed');
})().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});