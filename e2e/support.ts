import { expect, type BrowserContext, type Page } from '@playwright/test';

/** The first open generates 26.000 sample orders in IndexedDB: give it time. */
export const SEED_TIMEOUT = 120_000;

/** Friday 2026-11-13 10:00 in Monterrey (UTC-6): the week of Sunday 2026-11-15 is open for orders. */
export const FRIDAY = new Date('2026-11-13T16:00:00Z');
/** Saturday 2026-11-14 11:31 in Monterrey: one minute after the close of that week. */
export const SATURDAY_1131 = new Date('2026-11-14T17:31:00Z');

/** Collects browser console errors and uncaught page errors so a test can assert there were none. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Missing favicon is not an application error.
    if (/favicon/i.test(text) || /Failed to load resource.*404/i.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Opens the app with a fixed clock and waits until the sample data is seeded and the home is usable. */
export async function openApp(page: Page, time: Date = FRIDAY): Promise<void> {
  await page.clock.install({ time });
  await page.goto('/');
  await expect(page.getByTestId('calculate-button')).toBeVisible({ timeout: SEED_TIMEOUT });
}

/** Client-side navigation (keeps the page, its fake clock and its state). */
export async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
}

/** Calculates the current week from the home screen and waits for a stored result. */
export async function calculateFromHome(page: Page): Promise<void> {
  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('plan-status')).toHaveText(/calculado|sin solución/);
}

/** Integers of the plan table in recipe order. */
export async function integerPortions(page: Page): Promise<number[]> {
  const cells = await page.getByTestId('integer-table').locator('tbody tr td:last-child').allInnerTexts();
  return cells.map((text) => Number(text.trim()));
}

export async function unlockAdmin(page: Page): Promise<void> {
  await navigate(page, '/admin');
  // Already unlocked when the screen was not left since the last unlock.
  if ((await page.getByTestId('admin-form').count()) > 0) return;
  await page.getByLabel('Clave de administración').fill('privee-cocina-2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('admin-form')).toBeVisible();
}

/** A second tab in the same browser context: same IndexedDB and same BroadcastChannel. */
export async function openSecondTab(context: BrowserContext): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab.getByTestId('calculate-button')).toBeVisible({ timeout: SEED_TIMEOUT });
  return tab;
}
