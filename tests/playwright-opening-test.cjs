const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const fileUrl = 'file://' + process.cwd().replace(/\\/g, '/') + '/dist/index.html';
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');
  
  // Wait for opening screen to be visible
  const opening = page.locator('#opening');
  await opening.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✅ Opening screen visible');
  
  // Landing should be hidden
  const landing = page.locator('#landing');
  await expect(landing).toBeHidden();
  console.log('✅ Landing initially hidden');
  
  // Click Continue button
  await page.click('#openingSkip');
  console.log('✅ Clicked Continue button');
  
  // Wait for animation
  await page.waitForTimeout(700);
  
  // Opening should be hidden
  await expect(opening).toBeHidden();
  console.log('✅ Opening hidden after click');
  
  // Landing should be visible
  await expect(landing).toBeVisible();
  console.log('✅ Landing visible after click');
  
  // openStudioBtn should be visible
  const openStudioBtn = page.locator('#openStudioBtn');
  await expect(openStudioBtn).toBeVisible();
  console.log('✅ openStudioBtn visible');
  
  await browser.close();
  console.log('🎉 All tests passed!');
  
  function expect(locator) {
    return {
      async toBeVisible() {
        await locator.waitFor({ state: 'visible', timeout: 5000 });
      },
      async toBeHidden() {
        await locator.waitFor({ state: 'hidden', timeout: 5000 });
      }
    };
  }
})().catch(e => {
  console.error('❌ Test failed:', e.message);
  process.exit(1);
});