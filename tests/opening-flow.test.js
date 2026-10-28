import { test, expect } from '@playwright/test';

test('opening screen continue button works', async ({ page }) => {
  await page.goto('file://' + process.cwd() + '/dist/index.html');
  await page.waitForLoadState('networkidle');
  
  // Wait for opening screen to be visible
  const opening = page.locator('#opening');
  await expect(opening).toBeVisible();
  
  // Landing should be hidden
  const landing = page.locator('#landing');
  await expect(landing).toBeHidden();
  
  // Click Continue button
  await page.click('#openingSkip');
  
  // Wait for animation
  await page.waitForTimeout(700);
  
  // Opening should be hidden
  await expect(opening).toBeHidden();
  
  // Landing should be visible
  await expect(landing).toBeVisible();
  
  // openStudioBtn should be focused or at least visible
  const openStudioBtn = page.locator('#openStudioBtn');
  await expect(openStudioBtn).toBeVisible();
});