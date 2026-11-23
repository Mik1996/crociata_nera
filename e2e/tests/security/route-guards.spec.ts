import type { Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { Shell, SignInPage } from '../../support/pages';

/** Pages with the clans' data (clanGuard). */
const CLAN_PAGES = [
  '/dashboard',
  '/current-war',
  '/cwl',
  '/raids',
  '/wars',
  '/players',
  '/bases',
  '/statistics',
];
const LEADER_PAGES = ['/cwl-selection'];
const ADMIN_PAGES = ['/admin', '/admin/publishing'];

/**
 * Opens `path` in a new tab of the same browser (same session) and checks where the router
 * settles: `expected` is a path (any query string, e.g. a default filter, is accepted) or a path
 * with a query (matched exactly). A new tab each time: Firefox and WebKit abort a navigation
 * started while the previous page is still redirecting.
 */
async function expectLanding(page: Page, path: string, expected: string): Promise<void> {
  const tab = await page.context().newPage();
  try {
    await tab.goto(path);
    await expect
      .soft(tab, `${path} → ${expected}`)
      .toHaveURL(
        (url) => (expected.includes('?') ? url.pathname + url.search : url.pathname) === expected,
      );
  } finally {
    await tab.close();
  }
}

test.describe('Page access by kind of visitor', () => {
  test('signed-out visitors are sent to the welcome page, which keeps the page asked for @cross @P0', async ({
    page,
  }) => {
    for (const path of [...CLAN_PAGES, ...LEADER_PAGES, '/profile', ...ADMIN_PAGES]) {
      await expectLanding(page, path, `/?returnUrl=${encodeURIComponent(path)}`);
    }
    // Public pages stay open.
    for (const path of ['/', '/join', '/settings', '/sign-in', '/sign-up', '/forgot-password']) {
      await expectLanding(page, path, path);
    }
  });

  test('signed-in users outside the clans only reach their profile @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const outsider = await users.create({ access: 'outside' });
    await signIn(outsider);
    for (const path of [...CLAN_PAGES, ...LEADER_PAGES]) {
      await expectLanding(page, path, '/profile');
    }
    for (const path of ADMIN_PAGES) await expectLanding(page, path, '/');
    // The profile explains why, and their linked account is shown as outside the clans.
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: t('profile.access.title') })).toBeVisible();
    await expect(page.getByText(t('profile.player.notInClan'))).toBeVisible();
  });

  test('clan members reach the clans’ pages, not the leaders’ nor the administration @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    for (const path of CLAN_PAGES) await expectLanding(page, path, path);
    for (const path of [...LEADER_PAGES, ...ADMIN_PAGES]) await expectLanding(page, path, '/');
    // The navigation does not offer what they cannot open.
    await page.goto('/dashboard');
    const nav = new Shell(page).nav();
    await expect(nav.getByRole('link', { name: t('nav.players') })).toBeVisible();
    await expect(nav.getByRole('link', { name: t('nav.cwlSelection') })).toHaveCount(0);
  });

  test('members of a sister clan have the same access as the main clan’s @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const sister = await users.create({ access: 'sister' });
    await signIn(sister);
    await expectLanding(page, '/players', '/players');
    await expectLanding(page, '/cwl-selection', '/');
  });

  test('leaders reach the CWL selections, not the administration @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const leader = await users.create({ access: 'leader' });
    await signIn(leader);
    await expectLanding(page, '/cwl-selection', '/cwl-selection');
    for (const path of ADMIN_PAGES) await expectLanding(page, path, '/');
  });

  test('administrators reach everything, without a game account @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const admin = await users.create({ admin: true });
    await signIn(admin);
    for (const path of [...CLAN_PAGES, ...LEADER_PAGES, ...ADMIN_PAGES, '/profile']) {
      await expectLanding(page, path, path);
    }
  });

  test('signed-in users do not see the sign-in and sign-up pages @P2', async ({
    page,
    users,
    signIn,
  }) => {
    const user = await users.create();
    await signIn(user);
    await expectLanding(page, '/sign-in', '/');
    await expectLanding(page, '/sign-up', '/');
  });

  test('an unknown page shows "not found" to signed-in users @P2', async ({
    page,
    users,
    signIn,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    await page.goto('/no-such-page-here');
    await expect(page.getByRole('heading', { name: t('notFound.title') })).toBeVisible();
  });
});

test.describe('Return address after sign-in', () => {
  for (const target of [
    '//evil.example/phish',
    'https://evil.example/',
    '/\\evil.example',
    'javascript:alert(1)',
  ]) {
    test(`never leaves the site: ${target} @P0`, async ({ page, users }) => {
      const user = await users.create();
      const signIn = new SignInPage(page);
      await signIn.goto(target);
      await signIn.signIn(user.username, user.password);
      await expect(new Shell(page).accountButton(user.username)).toBeVisible();
      // Lands on the home page of this site, wherever the parameter pointed.
      await expect(page).toHaveURL((url) => url.href === new URL('/', page.url()).href);
    });
  }
});
