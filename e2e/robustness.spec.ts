import { test, expect } from '@playwright/test';
import { calculateFromHome, navigate, openApp, SEED_TIMEOUT, trackErrors, unlockAdmin } from './support';

test('IndexedDB unavailable: a blocking notice explains it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await page.goto('/');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se puede abrir la app');
  await expect(alert).toContainText('Tu navegador no permite guardar datos en este dispositivo');
  await expect(page.getByTestId('calculate-button')).toHaveCount(0);
});

test('admin key gate: wrong key is rejected, the right one unlocks the form', async ({ page }) => {
  await openApp(page);
  await navigate(page, '/admin');
  await expect(page.getByText('no es autenticación real')).toBeVisible();
  await page.getByLabel('Clave de administración').fill('equivocada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Clave incorrecta')).toBeVisible();
  await expect(page.getByTestId('admin-form')).toHaveCount(0);
  await unlockAdmin(page);
});

test('«Restaurar datos de ejemplo» wipes the changes and regenerates the sample data', async ({ page }) => {
  await openApp(page);
  await navigate(page, '/pedidos');
  await page.getByRole('button', { name: /^Cancelar P-/ }).first().click();
  await navigate(page, '/');
  await expect(page.getByTestId('orders-count')).toContainText('49');

  await navigate(page, '/ajustes');
  await page.getByRole('button', { name: 'Restaurar datos de ejemplo' }).click();
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByTestId('restore-report')).toBeVisible({ timeout: SEED_TIMEOUT });

  await navigate(page, '/');
  await expect(page.getByTestId('orders-count')).toContainText('50');
  await expect(page.getByTestId('total-portions')).toContainText('300');
});

test('empty week: a week without orders shows an explanatory empty state', async ({ page }) => {
  await openApp(page);
  await navigate(page, '/pedidos');
  await page.getByLabel('Semana', { exact: true }).selectOption('2026-11-22');
  await expect(page.getByText('Todavía no hay pedidos para esta semana')).toBeVisible();
});

test('no console errors while walking through every screen', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await calculateFromHome(page);
  for (const route of ['/pedidos', '/recetas', '/plan', '/plan/explicacion', '/compras', '/rutas', '/historial', '/ajustes', '/admin', '/mas']) {
    await navigate(page, route);
  }
  await page.goto('/ruta-que-no-existe');
  await expect(page.getByText('Esta página no existe')).toBeVisible({ timeout: SEED_TIMEOUT });
  expect(errors).toEqual([]);
});

test('routes screen shows the quota used and free for each Sunday route', async ({ page }) => {
  await openApp(page);
  await navigate(page, '/rutas');
  for (const id of ['open', 'morning', 'afternoon']) {
    await expect(page.getByTestId(`route-${id}`)).toBeVisible();
    await expect(page.getByTestId(`route-${id}-used`)).toBeVisible();
    await expect(page.getByTestId(`route-${id}-free`)).toBeVisible();
  }
});
