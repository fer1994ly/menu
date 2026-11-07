import { test, expect } from '@playwright/test';

test('app shell renders the Privee Food title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Privee Food');
  await expect(page.getByRole('heading', { name: 'Privee Food' })).toBeVisible();
});
