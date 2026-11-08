import { test, expect } from '@playwright/test';
import { navigate, openApp, openSecondTab } from './support';

test('AC10: two tabs edit the same order; the conflict notice shows both values and the history records it', async ({ page, context }) => {
  await openApp(page);
  const tabB = await openSecondTab(context);

  for (const tab of [page, tabB]) {
    await navigate(tab, '/pedidos');
    await expect(tab.getByTestId('order-row').first()).toBeVisible();
  }
  const editA = page.getByRole('button', { name: /^Editar P-/ }).first();
  const label = (await editA.getAttribute('aria-label')) ?? '';
  const code = label.replace('Editar ', '');
  await expect(tabB.getByRole('button', { name: `Editar ${code}` })).toBeVisible();

  // Both tabs open the editor of the same order before anyone saves.
  await editA.click();
  await tabB.getByRole('button', { name: `Editar ${code}` }).click();
  const routeA = page.getByTestId('order-editor').getByLabel('Ruta');
  const routeB = tabB.getByTestId('order-editor').getByLabel('Ruta');
  const current = await routeA.inputValue();
  const others = ['open', 'morning', 'afternoon'].filter((value) => value !== current);

  await routeA.selectOption(others[0]!);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByTestId('order-feedback')).toContainText(`Pedido ${code} guardado.`);

  // The second tab saves from a stale version: the conflict rule applies.
  await routeB.selectOption(others[1]!);
  await tabB.getByRole('button', { name: 'Guardar cambios' }).click();
  const notice = tabB.getByTestId('conflict-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(code);
  const noticeText = await notice.innerText();
  expect(noticeText.length).toBeGreaterThan(40);

  // Before the close the last saved version wins and the notice offers the other value.
  await expect(notice.getByRole('button', { name: 'Elegir el otro valor' })).toBeVisible();

  // The conflict is logged in the history of either tab.
  await navigate(tabB, '/historial');
  await expect(tabB.getByTestId('history-conflict').first()).toBeVisible();
  await navigate(page, '/historial');
  await expect(page.getByTestId('history-conflict').first()).toBeVisible();
});
