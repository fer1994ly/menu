import { test, expect } from '@playwright/test';
import { navigate, openApp, unlockAdmin } from './support';

// The 50-step limit (and the disabled 51st step) is proven at integration level:
// src/app/__tests__/integration.test.ts. Here the same stack is exercised through the screens.
test('AC8: a recipe change and a caps change can be undone and redone; empty stacks explain themselves', async ({ page }) => {
  await openApp(page);
  const undo = page.getByRole('button', { name: 'Deshacer', exact: true });
  const redo = page.getByRole('button', { name: 'Rehacer', exact: true });
  const message = page.getByTestId('undo-message');
  // The buttons stay focusable with aria-disabled when a step is unavailable (the reason is shown as text),
  // so Playwright reports them as not enabled: click with force to read the reason.

  // Nothing to undo or redo yet.
  await undo.click({ force: true });
  await expect(message).toContainText('No hay más pasos para deshacer (máximo 50)');
  await redo.click({ force: true });
  await expect(message).toContainText('No hay pasos para rehacer');

  // Change 1: recipe R1 cost.
  await navigate(page, '/recetas');
  await expect(page.getByTestId('recipe-R1-cost')).toHaveText('$48,50');
  await page.getByRole('button', { name: 'Editar R1', exact: true }).click();
  await page.getByTestId('recipe-form').getByLabel('Costo por porción').fill('50');
  await page.getByRole('button', { name: 'Guardar receta' }).click();
  await expect(page.getByTestId('recipe-R1-cost')).toHaveText('$50,00');

  // Change 2: default chicken cap in the admin panel.
  await unlockAdmin(page);
  const chickenCap = page.getByTestId('admin-form').getByLabel('Tope de pollo (kg)');
  const originalCap = await chickenCap.inputValue();
  await chickenCap.fill('30');
  await page.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(page.getByText('Ajustes guardados.')).toBeVisible();

  // Undo the caps change, then the recipe change.
  await undo.click({ force: true });
  await expect(message).toContainText('Deshecho');
  await unlockAdmin(page);
  await expect(page.getByTestId('admin-form').getByLabel('Tope de pollo (kg)')).toHaveValue(originalCap);
  await navigate(page, '/recetas');
  await expect(page.getByTestId('recipe-R1-cost')).toHaveText('$50,00');
  await undo.click({ force: true });
  await expect(page.getByTestId('recipe-R1-cost')).toHaveText('$48,50');

  // The stack is empty again.
  await undo.click({ force: true });
  await expect(message).toContainText('No hay más pasos para deshacer (máximo 50)');

  // Redo both changes.
  await redo.click({ force: true });
  await expect(page.getByTestId('recipe-R1-cost')).toHaveText('$50,00');
  await redo.click({ force: true });
  await expect(message).toContainText('Rehecho');
  await unlockAdmin(page);
  await expect(page.getByTestId('admin-form').getByLabel('Tope de pollo (kg)')).toHaveValue('30');
  await redo.click({ force: true });
  await expect(message).toContainText('No hay pasos para rehacer');

  // History screen shows the depth counter.
  await navigate(page, '/historial');
  await expect(page.getByTestId('undo-depth')).toContainText('de 50');
});
