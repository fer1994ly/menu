import { test, expect } from '@playwright/test';
import { navigate, openApp } from './support';

/** Saturday of a delivery Sunday as `YYYY-MM-DD`. */
function saturdayBefore(sunday: string): string {
  const date = new Date(`${sunday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

test('AC9: «Estado al…» Saturday 11:00 shows fewer orders and portions than at the close', async ({ page }) => {
  await openApp(page);
  await navigate(page, '/historial');
  const panel = page.getByTestId('state-at');
  const weekSelect = panel.getByLabel('Semana');

  // Most recent closed history week that has a production plan (some weeks have no feasible plan
  // under their caps, see the README): newest first, skipping the current and the next week.
  const options = await weekSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  const history = options.filter((week) => week < '2026-11-15');
  let chosen: string | null = null;
  for (const week of history) {
    await weekSelect.selectOption(week);
    await panel.getByRole('button', { name: 'Sábado 11:00 de la semana elegida' }).click();
    await expect(panel.getByRole('heading', { level: 3, name: `Estado al ${saturdayBefore(week)} 11:00:00` })).toBeVisible();
    if ((await panel.getByTestId('state-at-table').count()) > 0) {
      chosen = week;
      break;
    }
  }
  expect(chosen, 'a closed history week with a feasible plan').not.toBeNull();
  const week = chosen as string;

  await expect(panel.getByTestId('state-at-table').locator('tbody tr')).not.toHaveCount(0);
  await expect(panel.getByTestId('state-at-cost')).toContainText('Costo con porciones enteras');
  const ordersAt1100 = Number(await panel.getByTestId('state-at-orders').locator('span').last().innerText());
  const dAt1100 = Number(await panel.getByTestId('state-at-d').locator('span').last().innerText());

  // The close of that week: Saturday 11:30.
  await panel.getByLabel('Fecha y hora (hora de Monterrey)').fill(`${saturdayBefore(week)}T11:30`);
  await panel.getByRole('button', { name: 'Ver estado' }).click();
  await expect(panel.getByRole('heading', { level: 3, name: `Estado al ${saturdayBefore(week)} 11:30:00` })).toBeVisible();
  const ordersAtClose = Number(await panel.getByTestId('state-at-orders').locator('span').last().innerText());
  const dAtClose = Number(await panel.getByTestId('state-at-d').locator('span').last().innerText());

  expect(ordersAt1100).toBeLessThan(ordersAtClose);
  expect(dAt1100).toBeLessThan(dAtClose);
});

test('«Estado al…» before the first record shows the initial seed with its notice', async ({ page }) => {
  await openApp(page);
  await navigate(page, '/historial');
  const panel = page.getByTestId('state-at');
  await panel.getByLabel('Fecha y hora (hora de Monterrey)').fill('2020-01-01T10:00');
  await panel.getByRole('button', { name: 'Ver estado' }).click();
  await expect(panel.getByTestId('state-at-notice')).toContainText('Antes del primer registro');
});
