import { test, expect } from '@playwright/test';
import { calculateFromHome, navigate, openApp, SATURDAY_1131 } from './support';

test('AC7: an order loaded Saturday 11:31 goes to next Sunday and leaves the current plan untouched', async ({ page }) => {
  await openApp(page);
  await calculateFromHome(page);
  await expect(page.getByTestId('plan-status')).toHaveText('calculado');
  await expect(page.getByTestId('total-portions')).toContainText('300');

  // One minute after the close of the week (Saturday 11:30 Monterrey).
  await page.clock.setSystemTime(SATURDAY_1131);

  await navigate(page, '/pedidos');
  await page.getByRole('button', { name: 'Nuevo pedido' }).click();
  await page.getByLabel('Cliente', { exact: true }).fill('a');
  await page.locator('form ul button').first().click();
  await page.getByRole('button', { name: 'Crear pedido' }).click();

  await expect(page.getByTestId('order-created')).toContainText('para la semana del');
  await expect(page.getByTestId('order-notices')).toContainText('El pedido entró después del cierre del sábado a las 11:30');
  await expect(page.getByTestId('order-notices')).toContainText('pasa a la semana del');

  // The week being produced is unchanged: same orders, same portions, plan not stale.
  await navigate(page, '/');
  await expect(page.getByTestId('orders-count')).toContainText('50');
  await expect(page.getByTestId('total-portions')).toContainText('300');
  await expect(page.getByTestId('plan-status')).toHaveText('calculado');
  await navigate(page, '/plan');
  await expect(page.getByTestId('stale-badge')).toHaveCount(0);
  await expect(page.getByTestId('plan-d')).toContainText('300');
});
