import { defineConfig, devices } from '@playwright/test';

// E2E tests run against the production build (`npm run build` first) so the
// service worker and offline behaviour are exercised for real.
// Set PW_CHANNEL=chrome or PW_CHANNEL=msedge to use an installed browser.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'android-phone', use: { ...devices['Pixel 7'], channel }, testIgnore: /desktop.spec.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel }, testMatch: /desktop\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
