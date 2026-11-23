import { defineConfig, devices } from '@playwright/test';
import { FAKES_URL, FRONTEND_URL } from './e2e/stack/config.mjs';

/**
 * End-to-end tests of Crociata Nera (see e2e/README.md).
 *
 * The suite runs against its own stack (e2e/stack/start-stack.mjs): production builds of the
 * frontend and backend, MongoDB in memory, fake Clash of Clans API and SMTP sink. It never talks to
 * the development servers, Atlas, Telegram or the real game API.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/.artifacts/test-results',
  // Fails the run if a server of the stack tried an outbound connection (network guard).
  globalTeardown: './e2e/support/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: CI,
  // One retry on CI absorbs an infrastructure hiccup; a test that needs it is still reported as
  // "flaky" (HTML report, GitHub annotations) and must be fixed, not ignored.
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: [
    [CI ? 'github' : 'list'],
    ['html', { outputFolder: './e2e/.artifacts/report', open: 'never' }],
    ['junit', { outputFile: './e2e/.artifacts/junit.xml' }],
  ],
  use: {
    baseURL: FRONTEND_URL,
    locale: 'en-US',
    timezoneId: 'Europe/Rome',
    // The production build registers a service worker: blocked, so every test sees the network.
    serviceWorkers: 'block',
    // The site honours reduced motion (scroll-driven 3D welcome page, animated panels): lighter and
    // deterministic. The welcome page is also checked with full motion (clan-data.spec.ts).
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', grepInvert: /@mobile/, use: { ...devices['Desktop Chrome'] } },
    // Phone layout checks (tagged @mobile).
    { name: 'mobile-chromium', grep: /@mobile/, use: { ...devices['Pixel 7'] } },
    // Critical journeys (tagged @cross) also run on the other engines: `npm run test:e2e:cross`.
    { name: 'firefox', grep: /@cross/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grep: /@cross/, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node e2e/stack/start-stack.mjs',
    // Ready only after seeding and the stack's safety checks (in-memory database, fake game API).
    url: `${FAKES_URL}/__e2e/ready`,
    // A fresh stack (empty database) for every run; E2E_REUSE_STACK=1 keeps one started by
    // `npm run e2e:stack` (faster when iterating with the UI mode).
    reuseExistingServer: process.env.E2E_REUSE_STACK === '1',
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
});
