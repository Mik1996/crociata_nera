import { messageKeys, refreshCookieValue } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { Shell, SignInPage } from '../../support/pages';
import { stack } from '../../support/stack';
import { newApiClient } from '../../support/users';
import type { APIRequestContext } from '@playwright/test';

test.describe('Sign-in and session', () => {
  test('a member asks for a protected page, signs in and is brought back to it @cross @P0', async ({
    page,
    users,
  }) => {
    const member = await users.create({ access: 'member' });

    await page.goto('/players');
    // Signed out: the welcome page, keeping the page asked for.
    await expect(page).toHaveURL(/\/\?returnUrl=%2Fplayers$/);
    await new Shell(page).signInLink().click();
    await expect(page).toHaveURL(/\/sign-in\?returnUrl=%2Fplayers$/);

    await new SignInPage(page).signIn(member.username, member.password);
    await expect(page).toHaveURL(/\/players$/);
    await expect(new Shell(page).accountButton(member.username)).toBeVisible();
    await expect(page.getByRole('heading', { name: t('nav.players'), exact: true })).toBeVisible();
  });

  test('the email works as identifier too, whatever its case @P1', async ({ page, users }) => {
    const user = await users.create();
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.signIn(user.email.toUpperCase(), user.password);
    await expect(new Shell(page).accountButton(user.username)).toBeVisible();
  });

  test('a wrong password and an unknown account get the same answer @P0', async ({
    page,
    api,
    users,
  }) => {
    const user = await users.create();
    const signIn = new SignInPage(page);
    await signIn.goto();

    await signIn.signIn(user.username, `${user.password}x`);
    await expect(signIn.alert()).toHaveText(t('ERROR.INVALID_CREDENTIALS'));
    await signIn.signIn('nobody-here-e2e', 'Whatever-123');
    await expect(signIn.alert()).toHaveText(t('ERROR.INVALID_CREDENTIALS'));
    await expect(new Shell(page).signInLink()).toBeVisible();

    // Same status and body from the API: registered accounts are not revealed.
    const wrong = await api.post('/auth/sign-in', {
      identifier: user.username,
      password: 'Wrong-pass-1',
    });
    const unknown = await api.post('/auth/sign-in', {
      identifier: 'nobody-here-e2e',
      password: 'Wrong-pass-1',
    });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
    expect(refreshCookieValue(wrong)).toBeUndefined();
  });

  test('the session survives a reload and a new tab; tokens stay out of page storage @cross @P0', async ({
    page,
    context,
    users,
    signIn,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    const shell = new Shell(page);

    await page.goto('/dashboard');
    await expect(shell.accountButton(member.username)).toBeVisible();
    // Reload once the page is idle (Firefox aborts a reload during the app's own navigation).
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(shell.accountButton(member.username)).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);

    const other = await context.newPage();
    await other.goto('/profile');
    await expect(new Shell(other).accountButton(member.username)).toBeVisible();

    // The refresh cookie is out of JavaScript's reach and sent only to the auth routes.
    const [cookie] = (await context.cookies()).filter((c) => c.name === 'cn_refresh');
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api/v1/auth',
      secure: true,
    });
    expect(await page.evaluate(() => document.cookie)).not.toContain('cn_refresh');
    // The access token lives in memory only.
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
  });

  test('signing out leaves the protected page and revokes the session on the server @cross @P0', async ({
    page,
    context,
    users,
    signIn,
    api,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    await page.goto('/players');
    const shell = new Shell(page);
    await expect(shell.accountButton(member.username)).toBeVisible();
    const before = (await context.cookies()).find((c) => c.name === 'cn_refresh')!.value;

    await shell.signOut(member.username);
    await expect(page).not.toHaveURL(/\/players$/);
    await expect(shell.signInLink()).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'cn_refresh')).toBeUndefined();

    // A copy of the old cookie (stolen, or kept by another tab) no longer works.
    const replay = await api.post('/auth/refresh', undefined, {
      headers: { cookie: `cn_refresh=${before}` },
    });
    expect(replay.status).toBe(401);
    expect(messageKeys(replay)).toContain('ERROR.INVALID_REFRESH_TOKEN');

    // Back on a protected page: the welcome page again.
    await page.goto('/players');
    await expect(page).toHaveURL(/\/\?returnUrl=%2Fplayers$/);
  });

  test('each refresh rotates the token; signing out ends the whole chain @P0', async ({
    users,
  }) => {
    const user = await users.create();
    const contexts: APIRequestContext[] = [];
    const device = await newApiClient(contexts);
    const signedIn = await device.signIn(user.username, user.password);
    const first = refreshCookieValue(signedIn)!;

    const rotated = await device.refresh();
    expect(rotated.status).toBe(200);
    const second = refreshCookieValue(rotated)!;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(rotated.body.result!.accessToken).toBeTruthy();

    const out = await device.post('/auth/sign-out');
    expect(out.status).toBe(200);
    expect(refreshCookieValue(out)).toBe('');

    // Neither the current token nor the rotated one opens a session any more.
    for (const token of [first, second]) {
      const replay = await user.api.post('/auth/refresh', undefined, {
        headers: { cookie: `cn_refresh=${token}` },
        anonymous: true,
      });
      expect(
        replay.status,
        `refresh with ${token === first ? 'the rotated' : 'the signed-out'} token`,
      ).toBe(401);
    }
    // The sessions are recorded as closed in the database.
    const sessions = await stack.find<{ revokedAt: string | null }>(
      'Sessions',
      { userId: user.id },
      { revokedAt: 1 },
    );
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    await Promise.all(contexts.map((c) => c.dispose()));
  });

  test('an expired or rejected access token is renewed silently from the refresh cookie @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    // The first players request is refused as if the access token had expired.
    let refused = false;
    await page.route('**/api/v1/players?**', async (route) => {
      if (refused) return route.continue();
      refused = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          result: null,
          messages: [{ key: 'ERROR.INVALID_TOKEN' }],
          status: 401,
        }),
      });
    });
    const refreshed = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/auth/refresh') && r.status() === 200,
    );
    await page.goto('/players');
    await refreshed;
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    await expect(new Shell(page).accountButton(member.username)).toBeVisible();
    expect(refused).toBe(true);
  });
});
