import { test, expect } from '@playwright/test';
import { calculateFromHome, integerPortions, navigate, openApp, trackErrors } from './support';

test.describe('AC1 / AC5: briefing cases through the UI', () => {
  test('case 1: normal week with a fraction tie, no warnings, shopping list by package', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await expect(page.getByTestId('plan-status')).toHaveText('sin calcular');
    await expect(page.getByTestId('total-portions')).toContainText('300');
    await expect(page.getByTestId('gluten-free-portions')).toContainText('25');

    await calculateFromHome(page);
    await expect(page.getByTestId('plan-status')).toHaveText('calculado');
    await expect(page.getByTestId('plan-summary')).toBeVisible();

    await navigate(page, '/plan');
    expect(await integerPortions(page)).toEqual([79, 39, 64, 58, 30, 30]);
    await expect(page.getByTestId('integer-cost')).toContainText('$14.710,50');
    await expect(page.getByTestId('continuous-cost')).toContainText('$14.700,56');
    await expect(page.getByTestId('avg-kcal')).toContainText('544,80');
    await expect(page.getByTestId('avg-protein')).toContainText('37,00');
    await expect(page.getByTestId('plan-d')).toContainText('300');
    await expect(page.getByTestId('plan-g')).toContainText('25');
    await expect(page.getByTestId('plan-warnings')).toHaveCount(0);

    await navigate(page, '/compras');
    const chicken = page.getByTestId('shopping-table').locator('tbody tr').nth(0);
    await expect(chicken).toContainText('Pollo');
    await expect(chicken).toContainText('25.940 g');
    await expect(chicken).toContainText('13');
    await expect(chicken).toContainText('$3.874,00');
    await expect(chicken).toContainText('60 g');
    const beef = page.getByTestId('shopping-table').locator('tbody tr').nth(1);
    await expect(beef).toContainText('Res');
    await expect(beef).toContainText('13.280 g');
    await expect(beef).toContainText('14');
    await expect(beef).toContainText('$3.066,00');
    await expect(beef).toContainText('720 g');
    await expect(page.getByTestId('shopping-total')).toContainText('$6.940,00');
    expect(errors).toEqual([]);
  });

  test('case 3: a chicken cap of 10 kg gives the exact no-solution message and no shopping list', async ({ page }) => {
    await openApp(page);
    await navigate(page, '/recetas');
    await page.getByLabel('Tope de pollo (kg)').fill('10');
    await page.getByRole('button', { name: 'Guardar menú' }).click();
    await expect(page.getByText('Menú guardado.')).toBeVisible();

    await navigate(page, '/');
    await calculateFromHome(page);
    await expect(page.getByTestId('plan-status')).toHaveText('sin solución');
    await expect(page.getByTestId('plan-failure')).toContainText(
      'No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.',
    );

    await navigate(page, '/compras');
    await expect(page.getByTestId('shopping-table')).toHaveCount(0);
  });

  test('case 3 after a good plan: the previous plan of the week is kept', async ({ page }) => {
    await openApp(page);
    await calculateFromHome(page);
    await navigate(page, '/recetas');
    await page.getByLabel('Tope de pollo (kg)').fill('10');
    await page.getByRole('button', { name: 'Guardar menú' }).click();
    await expect(page.getByText('Menú guardado.')).toBeVisible();

    await navigate(page, '/');
    await page.getByTestId('calculate-button').click();
    await expect(page.getByTestId('plan-failure')).toContainText('No hay plan de producción posible con estos topes.');
    await expect(page.getByTestId('plan-failure')).toContainText('Se conserva el plan anterior de esta semana.');

    await navigate(page, '/plan');
    expect(await integerPortions(page)).toEqual([79, 39, 64, 58, 30, 30]);
    await expect(page.getByTestId('stale-badge')).toBeVisible();
  });

  test('case 2: cancelling 29 plan-5 orders and capping chicken at 13 kg shows the protein warning above the plan', async ({ page }) => {
    await openApp(page);
    // 50 orders: 40 of plan 5 (5 of them gluten-free) and 10 of plan 10. Cancel 29 plan-5 orders
    // with gluten: D = 300 - 145 = 155 and G stays 25 (briefing case 2).
    await navigate(page, '/pedidos');
    await page.getByLabel('Plan', { exact: true }).selectOption('5');
    await page.getByLabel('Sin gluten', { exact: true }).selectOption('no');
    await expect(page.getByTestId('orders-total')).toContainText('35 pedidos');
    for (let done = 1; done <= 29; done += 1) {
      await page.getByRole('button', { name: /^Cancelar P-/ }).first().click();
      await expect(page.getByTestId('orders-total')).toContainText(`${35 - done} pedido`);
    }
    await navigate(page, '/recetas');
    await page.getByLabel('Tope de pollo (kg)').fill('13');
    await page.getByRole('button', { name: 'Guardar menú' }).click();
    await expect(page.getByText('Menú guardado.')).toBeVisible();

    await navigate(page, '/');
    await expect(page.getByTestId('total-portions')).toContainText('155');
    await calculateFromHome(page);
    await navigate(page, '/plan');
    expect(await integerPortions(page)).toEqual([46, 21, 37, 20, 16, 15]);
    await expect(page.getByTestId('integer-cost')).toContainText('$7.693,00');
    await expect(page.getByTestId('continuous-cost')).toContainText('$7.663,60');
    await expect(page.getByTestId('avg-kcal')).toContainText('544,65');
    await expect(page.getByTestId('avg-protein')).toContainText('36,98');
    const warnings = page.getByTestId('plan-warnings');
    await expect(warnings).toContainText('Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g');
    // The warning is rendered before (above) the plan tables, not inside a tooltip.
    const warningBox = await warnings.boundingBox();
    const tableBox = await page.getByTestId('integer-table').boundingBox();
    expect(warningBox!.y).toBeLessThan(tableBox!.y);

    await navigate(page, '/compras');
    const chicken = page.getByTestId('shopping-table').locator('tbody tr').nth(0);
    await expect(chicken).toContainText('12.880 g');
    await expect(chicken).toContainText('$2.086,00');
    await expect(chicken).toContainText('1.120 g');
    const beef = page.getByTestId('shopping-table').locator('tbody tr').nth(1);
    await expect(beef).toContainText('7.430 g');
    await expect(beef).toContainText('$1.752,00');
    await expect(beef).toContainText('570 g');
  });
});
