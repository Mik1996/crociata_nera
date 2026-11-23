import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { ApiClient } from './api';
import { newApiClient, randomIp, SharedAdmin, type TestUser, UserFactory } from './users';

interface Fixtures {
  /** Source address of the test's browser and `api` client (own rate-limit buckets). */
  ip: string;
  /** Creates the test's users; their game accounts are given back after the test. */
  users: UserFactory;
  /** Anonymous API client (its own cookie jar). */
  api: ApiClient;
  /** Signs the test's browser in as `user` (the refresh cookie lands in the browser). */
  signIn: (user: TestUser, page?: Page) => Promise<void>;
  /**
   * Uncaught errors of every page the test opens (its `page`, other tabs, `pageAs` pages). The test
   * fails if any is left at its end. Needs no browser: API-only tests open none.
   */
  pageErrors: Error[];
  /**
   * A page in a new browser context signed in as `user` (another person at another computer:
   * own cookies, own address), for journeys with several users.
   */
  pageAs: (user: TestUser) => Promise<Page>;
}

interface WorkerFixtures {
  sharedAdmin: SharedAdmin;
}

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

/**
 * Rules of every browser context of the suite: nothing leaves the machine (game CDN, fonts or
 * anything else external is refused; the pages must cope with missing pictures anyway), and every
 * page opened in it reports its uncaught errors to the test.
 */
async function prepareContext(context: BrowserContext, errors: Error[]): Promise<void> {
  await context.route(
    (url) => !LOCAL.test(url.href),
    (route) => route.abort('blockedbyclient'),
  );
  const watch = (page: Page) => {
    page.on('pageerror', (error) => errors.push(error));
    // Angular's global error listeners catch uncaught errors and rejected promises and report them
    // through its ErrorHandler (`console.error('ERROR', error)`): the browser never sees them as
    // page errors, so they are collected here.
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().startsWith('ERROR'))
        errors.push(new Error(`Angular ErrorHandler on ${page.url()}: ${message.text()}`));
    });
  };
  context.pages().forEach(watch);
  context.on('page', watch);
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  sharedAdmin: [
    async ({}, use) => {
      const admin = new SharedAdmin();
      await use(admin);
      await admin.dispose();
    },
    { scope: 'worker' },
  ],

  ip: async ({}, use) => use(randomIp()),

  // Every request of the test's browser comes from the test's own address (the frontend's proxy
  // passes the header on, as Caddy does with the real client address in production).
  extraHTTPHeaders: async ({ ip }, use) => use({ 'x-forwarded-for': ip }),

  pageErrors: [
    async ({}, use, testInfo) => {
      const errors: Error[] = [];
      await use(errors);
      if (!testInfo.annotations.some((a) => a.type === 'allow-page-errors')) {
        expect(
          errors.map((e) => e.message),
          'uncaught errors in the page',
        ).toEqual([]);
      }
    },
    { auto: true },
  ],

  // Created only when a test uses a browser (`page`, `context`, `signIn`).
  context: async ({ context, pageErrors }, use) => {
    await prepareContext(context, pageErrors);
    await use(context);
  },

  users: async ({ sharedAdmin }, use) => {
    const factory = new UserFactory(sharedAdmin);
    await use(factory);
    await factory.cleanup();
  },

  api: async ({ ip }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(await newApiClient(contexts, ip));
    await Promise.all(contexts.map((c) => c.dispose()));
  },

  pageAs: async ({ browser, baseURL, pageErrors }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (user) => {
      const context = await browser.newContext({
        baseURL,
        extraHTTPHeaders: { 'x-forwarded-for': randomIp() },
      });
      contexts.push(context);
      await prepareContext(context, pageErrors);
      const reply = await context.request.post('/api/v1/auth/sign-in', {
        data: { identifier: user.username, password: user.password },
      });
      expect(reply.status(), `sign-in of ${user.username}`).toBe(200);
      return context.newPage();
    });
    await Promise.all(contexts.map((c) => c.close()));
  },

  signIn: async ({ page }, use) => {
    await use(async (user, target = page) => {
      const reply = await target.context().request.post('/api/v1/auth/sign-in', {
        data: { identifier: user.username, password: user.password },
      });
      expect(reply.status(), `sign-in of ${user.username}`).toBe(200);
    });
  },
});

export { expect };
