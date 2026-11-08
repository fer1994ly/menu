import { test, expect } from '@playwright/test';
import { navigate, SEED_TIMEOUT } from './support';

test('AC6: recalculating the 52 history weeks takes under 4 s and the UI stays responsive', async ({ page }) => {
  // No fake clock here: this test measures real elapsed time and animation frames.
  await page.goto('/');
  await expect(page.getByTestId('calculate-button')).toBeVisible({ timeout: SEED_TIMEOUT });

  await navigate(page, '/plan');

  await page.evaluate(() => {
    const counter = { frames: 0 };
    (window as unknown as { __frames: typeof counter }).__frames = counter;
    const tick = () => {
      counter.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const started = Date.now();
  await page.getByRole('button', { name: 'Recalcular las 52 semanas' }).click();
  // The page keeps accepting input while the worker computes.
  const operator = page.getByLabel('Operador');
  await operator.fill('Operadora E2E');
  await expect(operator).toHaveValue('Operadora E2E');
  await expect(page.getByTestId('recalc-result')).toContainText('52 semanas recalculadas', { timeout: 30_000 });
  const wallMs = Date.now() - started;

  const text = await page.getByTestId('recalc-result').innerText();
  const reported = Number(/en (\d+) ms/.exec(text)?.[1]);
  expect(reported).toBeLessThan(4000);
  expect(wallMs).toBeLessThan(15_000);

  const frames = await page.evaluate(() => (window as unknown as { __frames: { frames: number } }).__frames.frames);
  expect(frames).toBeGreaterThan(0);

  // The current-week calculation reports its own time too.
  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('elapsed-ms')).toContainText(/\d+ ms/);
  const single = Number(/(\d+) ms/.exec(await page.getByTestId('elapsed-ms').innerText())?.[1]);
  expect(single).toBeLessThan(4000);
});
