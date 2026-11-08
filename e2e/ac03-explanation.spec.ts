import { test, expect } from '@playwright/test';
import { calculateFromHome, navigate, openApp } from './support';

test('AC3: the explanation shows the real tableaus, pivots of both phases and the rounding table', async ({ page }) => {
  await openApp(page);
  await calculateFromHome(page);
  await navigate(page, '/plan/explicacion');

  await expect(page.getByTestId('initial-tableau').first()).toBeVisible();
  await expect(page.getByTestId('final-tableau').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Fase 1:/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Fase 2:/ }).first()).toBeVisible();
  expect(await page.getByTestId('pivot-step').count()).toBeGreaterThanOrEqual(2);

  // Open one pivot: it carries the entering and leaving variables and the resulting tableau.
  const pivot = page.getByTestId('pivot-step').first();
  await pivot.locator('summary').click();
  await expect(pivot).toContainText(/Pivote 1: entra .+, sale .+, elemento pivote/);

  // Largest remainder: R2 and R4 tie at 0,333333 and the extra portion goes to R2.
  const rounding = page.getByTestId('rounding-table');
  await expect(rounding).toBeVisible();
  const r2 = rounding.locator('tbody tr', { hasText: /^R2/ });
  await expect(r2).toContainText('+1');
  await expect(r2).toContainText('0,333333');
  await expect(rounding.locator('tbody tr', { hasText: /^R4/ })).not.toContainText('+1');
  await expect(rounding.locator('tbody tr', { hasText: '+1' })).toHaveCount(1);
});
