import { test, expect } from '@playwright/test';

// The first open generates 26.000 sample orders in IndexedDB: give it time.
const FIRST_SEED_TIMEOUT = 120_000;

test('app shell loads, seeds the sample data and shows the home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Privee Food');
  await expect(page.getByRole('heading', { name: 'Privee Food', level: 1 })).toBeVisible();
  await expect(page.getByTestId('calculate-button')).toBeVisible({ timeout: FIRST_SEED_TIMEOUT });
  await expect(page.getByTestId('orders-count')).toBeVisible();
});

test('«Calcular producción» is visible without scrolling and the page never scrolls sideways', async ({ page }) => {
  await page.goto('/');
  const button = page.getByTestId('calculate-button');
  await expect(button).toBeVisible({ timeout: FIRST_SEED_TIMEOUT });
  const viewport = page.viewportSize();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('no screen scrolls sideways', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('calculate-button')).toBeVisible({ timeout: FIRST_SEED_TIMEOUT });
  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('plan-status')).toHaveText(/calculado|sin solución/);
  for (const route of ['/pedidos', '/plan', '/plan/explicacion', '/compras', '/rutas', '/recetas', '/historial', '/ajustes', '/admin', '/mas']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
  }
});
