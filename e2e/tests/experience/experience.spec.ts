import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { Shell } from '../../support/pages';
import { stack } from '../../support/stack';
import { LANGUAGES } from '../../../src/app/core/i18n/languages';

/** Names of the languages as the language menu shows them (the app's own list). */
const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)!.name;

const IT = JSON.parse(readFileSync(join(__dirname, '../../../public/i18n/it-IT.json'), 'utf8'));

test.describe('Language', () => {
  test('switching to Italian translates the site and is remembered @P2', async ({ page }) => {
    await page.goto('/join');
    await page.getByRole('button', { name: t('language.change', { name: languageName('en-US') }) }).click();
    await page.getByRole('menuitem', { name: languageName('it-IT') }).click();
    await expect(
      page.getByRole('heading', { name: IT.join.title, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', /^it/);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: IT.join.title, exact: true, level: 1 }),
    ).toBeVisible();
  });
});

test.describe('Failures of the game API', () => {
  test('a failed load shows the reason and "Retry" recovers @P1', async ({
    page,
    users,
    signIn,
  }) => {
    await signIn(await users.create({ access: 'member' }));
    const { battleDay } = await stack.game();
    // The backend answers as when the Clash of Clans API is down (502 COC_API_UNAVAILABLE).
    let down = true;
    await page.route('**/api/v1/wars/current', (route) =>
      down
        ? route.fulfill({
            status: 502,
            contentType: 'application/json',
            body: JSON.stringify({
              result: null,
              messages: [{ key: 'ERROR.COC_API_UNAVAILABLE' }],
              status: 502,
            }),
          })
        : route.continue(),
    );
    await page.goto('/current-war');
    await expect(page.getByText(t('ERROR.COC_API_UNAVAILABLE'))).toBeVisible();

    down = false;
    await page.getByRole('button', { name: t('status.retry') }).click();
    await expect(page.getByRole('heading', { name: battleDay.opponent.name })).toBeVisible();
    await expect(page.getByText(t('ERROR.COC_API_UNAVAILABLE'))).toBeHidden();
  });
});

test.describe('Connectivity', () => {
  test('losing the connection shows the offline banner, which goes away when it is back @P3', async ({
    page,
    context,
    users,
    signIn,
  }) => {
    await signIn(await users.create({ access: 'member' }));
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: t('nav.dashboard'), level: 1 })).toBeVisible();

    await context.setOffline(true);
    const banner = page.getByRole('status').filter({ hasText: t('app.offline.banner') });
    await expect(banner).toBeVisible();
    await context.setOffline(false);
    await expect(banner).toBeHidden();
  });
});

test.describe('Exports', () => {
  test('the Raid Weekend table downloads as a PDF @P2', async ({ page, users, signIn }) => {
    test.slow(); // pdfmake and its fonts are loaded on first use
    await signIn(await users.create({ access: 'member' }));
    await page.goto('/raids');
    await expect(page.getByRole('group', { name: t('raids.totalLoot') })).toBeVisible();

    await page.getByRole('button', { name: t('pdf.download') }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: t('pdf.asPdf') }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const content = readFileSync((await file.path())!);
    expect(content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(content.length).toBeGreaterThan(10_000);
  });
});

test.describe('Phones', () => {
  test('the navigation drawer opens from the menu button @mobile @P3', async ({
    page,
    users,
    signIn,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    await page.goto('/dashboard');
    const shell = new Shell(page);
    await expect(shell.nav().getByRole('link', { name: t('nav.players') })).not.toBeInViewport();

    await page.getByRole('button', { name: t('app.toggleNavigation') }).click();
    await shell
      .nav()
      .getByRole('link', { name: t('nav.players') })
      .click();
    await expect(page).toHaveURL(/\/players$/);
    await expect(page.getByRole('heading', { name: t('nav.players'), level: 1 })).toBeVisible();
  });
});
