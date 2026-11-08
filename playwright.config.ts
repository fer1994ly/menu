import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** When BASE_URL is set the suite runs against that deployment and no local server is started. */
const REMOTE_URL = process.env['BASE_URL'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : 3,
  // The first open generates 26.000 sample orders in IndexedDB: be generous.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { baseURL: REMOTE_URL ?? `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'mobile-360',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  ...(REMOTE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run preview',
          port: PORT,
          reuseExistingServer: !process.env['CI'],
          timeout: 180_000,
        },
      }),
});
