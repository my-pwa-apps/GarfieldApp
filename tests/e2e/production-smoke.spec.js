const { test, expect } = require('@playwright/test');

test.describe('production smoke', () => {
  test.skip(process.env.RUN_PROD_SMOKE !== '1', 'Set RUN_PROD_SMOKE=1 to run against production without mocks.');

  test('deployed app boots and exposes core controls', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('https://garfieldapp.pages.dev/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#comic')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
    expect(consoleErrors).toEqual([]);
  });
});