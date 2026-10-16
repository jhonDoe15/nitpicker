import { expect, test } from '@playwright/test';

test('saves the form', async ({ page }) => {
  await page.getByTestId('save').click();

  await expect(page.getByTestId('toast')).toBeVisible();
});
