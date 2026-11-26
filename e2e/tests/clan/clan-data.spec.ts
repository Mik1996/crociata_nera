import type { Locator } from '@playwright/test';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { accessibleText, escape, Shell } from '../../support/pages';
import { CLANS, stack, type CocWar } from '../../support/stack';

/**
 * The clans' pages show what the backend synchronised from the (fake) game API at start-up:
 * three finished wars, a war on its battle day and two Raid Weekends of Crociata Nera. Expected
 * values are computed from the stack's game data, never typed in the test.
 */

/** Result of a finished war as the game decides it: stars first, then destruction. */
function resultOf(war: CocWar): 'victory' | 'defeat' | 'draw' {
  const byStars = war.clan.stars - war.opponent.stars;
  const byDestruction = war.clan.destructionPercentage - war.opponent.destructionPercentage;
  const margin = byStars !== 0 ? byStars : byDestruction;
  return margin > 0 ? 'victory' : margin < 0 ? 'defeat' : 'draw';
}

/**
 * A figure of a summary card, read as "<label> <value>", optionally followed by a remark
 * ("Victories 2 67% of total").
 */
async function expectFigure(card: Locator, label: string, value: string | number): Promise<void> {
  await expect
    .poll(() => accessibleText(card), { message: `${label} card` })
    .toMatch(new RegExp(`^${escape(label)} ${escape(String(value))}( |$)`));
}

/** The score card of a war, read exactly: "Stars earned: 15 Stars conceded: 12". */
async function expectScore(card: Locator, war: CocWar): Promise<void> {
  const earned = `${t('summary.starsEarned')} ${war.clan.stars}`;
  const conceded = `${t('summary.starsConceded')} ${war.opponent.stars}`;
  await expect
    .poll(() => accessibleText(card), { message: 'score card' })
    .toBe(`${earned} ${conceded}`);
}

test.describe('Clan data pages', () => {
  test.beforeEach(async ({ users, signIn }) => {
    await signIn(await users.create({ access: 'member' }));
  });

  test('the dashboard shows the war in progress @cross @P1', async ({ page }) => {
    const { battleDay } = await stack.game();
    await page.goto('/dashboard');
    const war = page.getByRole('region', { name: t('dashboard.warInProgress') });
    await expect(
      war
        .getByRole('region', { name: t('summary.opponent') })
        .getByRole('heading', { name: battleDay.opponent.name }),
    ).toBeVisible();
    await expectScore(war.getByRole('group', { name: t('summary.score') }), battleDay);
    await war.getByRole('link', { name: t('common.viewDetails') }).click();
    await expect(page).toHaveURL(/\/current-war$/);
  });

  test('the current war page lists the score and every participant @P1', async ({ page }) => {
    const { battleDay } = await stack.game();
    await page.goto('/current-war');
    await expect(
      page
        .getByRole('region', { name: t('summary.opponent') })
        .getByRole('heading', { name: battleDay.opponent.name }),
    ).toBeVisible();
    await expectScore(page.getByRole('group', { name: t('summary.score') }), battleDay);
    const table = page.getByRole('table', { name: new RegExp(t('currentWar.participants')) });
    const rows = table.getByRole('rowgroup').nth(1).getByRole('row');
    await expect(rows).toHaveCount(battleDay.clan.members.length);
    for (const member of battleDay.clan.members) {
      await expect(table.getByRole('link', { name: member.name, exact: true })).toBeVisible();
    }
  });

  test('the war history counts the results and opens a war’s details @P1', async ({ page }) => {
    const { endedWars } = await stack.game();
    const count = (result: string) => endedWars.filter((w) => resultOf(w) === result).length;
    await page.goto('/wars');
    await expectFigure(
      page.getByRole('group', { name: t('history.warsAnalyzed'), exact: true }),
      t('history.warsAnalyzed'),
      endedWars.length,
    );
    await expectFigure(
      page.getByRole('group', { name: t('history.victories'), exact: true }),
      t('history.victories'),
      count('victory'),
    );
    await expectFigure(
      page.getByRole('group', { name: t('history.defeats'), exact: true }),
      t('history.defeats'),
      count('defeat'),
    );

    // One row per war, with its own result and score.
    const table = page.getByRole('table', { name: new RegExp(t('history.finishedWars')) });
    await expect(table.getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(endedWars.length);
    for (const war of endedWars) {
      const row = table
        .getByRole('row')
        .filter({ has: page.getByRole('link', { name: war.opponent.name, exact: true }) });
      await expect(
        row.getByRole('cell', { name: t(`result.${resultOf(war)}`), exact: true }),
      ).toBeVisible();
      await expect(
        row.getByRole('cell', { name: `${war.clan.stars} – ${war.opponent.stars}`, exact: true }),
      ).toBeVisible();
    }

    const latest = endedWars.at(-1)!;
    await table.getByRole('link', { name: latest.opponent.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/wars/.+-${latest.opponent.tag.slice(1)}$`));
    await expect(page.getByRole('heading', { name: latest.opponent.name }).first()).toBeVisible();
    for (const member of latest.clan.members.slice(0, 3)) {
      await expect(
        page.getByRole('link', { name: member.name, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('an unknown war shows "not found" instead of breaking @P2', async ({ page }) => {
    await page.goto('/wars/20200101T000000-NOPE');
    await expect(page.getByText(t('warDetail.notFound'), { exact: true })).toBeVisible();
  });

  test('the players table is filtered and sorted by the backend @P1', async ({ page }) => {
    const { clans } = await stack.game();
    const members = clans[CLANS.nera]!.memberList;
    await page.goto('/players');
    const table = page.getByRole('table', {
      name: new RegExp(`^${escape(t('players.members', { n: members.length }))}`),
    });
    // Every member, in one table that scrolls inside.
    await expect(table.getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(members.length);

    // Text filter: one request to the backend, one row back.
    const target = members[9]!;
    await table.getByRole('button', { name: t('table.showFilters') }).click();
    const filtered = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/players?') && r.url().includes(encodeURIComponent(target.name)),
    );
    await table
      .getByRole('searchbox', { name: t('table.filterBy', { name: t('common.player') }) })
      .fill(target.name);
    expect((await filtered).status()).toBe(200);
    const body = table.getByRole('rowgroup').nth(1);
    await expect(body.getByRole('row')).toHaveCount(1);
    await expect(body.getByRole('link', { name: target.name, exact: true })).toBeVisible();

    // The player's page opens from the row.
    await body.getByRole('link', { name: target.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/players/${encodeURIComponent(target.tag)}$`));
    await expect(page.getByRole('heading', { name: target.name }).first()).toBeVisible();
    await expect(page.getByText(target.tag, { exact: true }).first()).toBeVisible();
  });

  test('sorting by player name asks the backend for the new order @P2', async ({ page }) => {
    const { clans } = await stack.game();
    const names = clans[CLANS.nera]!.memberList.map((m) => m.name).sort((a, b) =>
      a.localeCompare(b),
    );
    await page.goto('/players');
    const table = page.getByRole('table').first();
    const sorted = page.waitForResponse(
      (r) => r.url().includes('/api/v1/players?') && r.url().includes('sort='),
    );
    await table.getByRole('button', { name: t('common.player'), exact: true }).click();
    expect((await sorted).status()).toBe(200);
    const rows = table.getByRole('rowgroup').nth(1).getByRole('row');
    // The first rows in alphabetical order, exactly.
    for (const [index, name] of names.slice(0, 3).entries()) {
      await expect(rows.nth(index).getByRole('link').first()).toHaveText(name);
    }
  });

  test('the Raid Weekend totals match the game’s @P1', async ({ page }) => {
    const { raids } = await stack.game();
    const latest = raids[0]!;
    await page.goto('/raids');
    await expectFigure(
      page.getByRole('group', { name: t('raids.totalLoot'), exact: true }),
      t('raids.totalLoot'),
      latest.capitalTotalLoot.toLocaleString('en-US'),
    );
    const best = [...latest.members].sort(
      (a, b) => b.capitalResourcesLooted - a.capitalResourcesLooted,
    )[0]!;
    const firstRow = page
      .getByRole('table', { name: new RegExp(t('raids.members')) })
      .getByRole('rowgroup')
      .nth(1)
      .getByRole('row')
      .first();
    await expect(firstRow.getByRole('link', { name: best.name, exact: true })).toBeVisible();
    await expect(
      firstRow.getByRole('cell', {
        name: best.capitalResourcesLooted.toLocaleString('en-US'),
        exact: true,
      }),
    ).toBeVisible();
  });

  test('the statistics sum up the finished wars @P2', async ({ page }) => {
    const { endedWars } = await stack.game();
    await page.goto('/statistics');
    await expectFigure(
      page.getByRole('group', { name: t('common.wars'), exact: true }),
      t('common.wars'),
      endedWars.length,
    );
    await expect(
      page.getByRole('table').first().getByRole('rowgroup').nth(1).getByRole('row').first(),
    ).toBeVisible();
  });
});

test.describe('Public pages', () => {
  // With its scroll-driven animation, as most visitors see it.
  test.use({ reducedMotion: 'no-preference' });

  test('the welcome page presents the clans of the Crusade from live game data @cross @P1', async ({
    page,
  }) => {
    const { clans } = await stack.game();
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: clans[CLANS.nera]!.name, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: clans[CLANS.rossa]!.name, exact: true }).first(),
    ).toBeAttached();
    await expect(
      page.getByRole('link', { name: clans[CLANS.oro]!.name, exact: true }).first(),
    ).toBeAttached();
    // Supercell's Fan Content Policy notice is always there.
    await expect(new Shell(page).fanContentNotice()).toBeVisible();
  });

  test('the "Join us" page is open to everybody @P2', async ({ page }) => {
    await page.goto('/join');
    await expect(
      page.getByRole('heading', { name: t('join.title'), exact: true, level: 1 }),
    ).toBeVisible();
  });
});

test.describe('CWL line-up', () => {
  test('a member reads the ranking of the three clans, without the leaders’ actions @P1', async ({
    page,
    users,
    signIn,
  }) => {
    await signIn(await users.create({ access: 'member' }));
    await page.goto('/cwl-selection');
    await expect(
      page.getByRole('heading', { name: t('nav.cwlSelection'), level: 1 }),
    ).toBeVisible();
    const table = page.getByRole('table').first();
    await expect(table.getByRole('rowgroup').nth(1).getByRole('row').first()).toBeVisible();
    await expect(page.getByRole('region', { name: t('cwlSelection.summary') })).toBeVisible();
    // Read-only: no closing, no exclusions, no download or share.
    await expect(page.getByRole('button', { name: t('cwlSelection.state.close') })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t('cwlSelection.excludeAction') })).toHaveCount(0);
    await expect(page.locator('crn-pdf-button')).toHaveCount(0);
  });

  test('a co-leader also downloads the line-up, but does not close it nor exclude players @P1', async ({
    page,
    users,
    signIn,
  }) => {
    await signIn(await users.create({ access: 'leader' }));
    await page.goto('/cwl-selection');
    const table = page.getByRole('table').first();
    await expect(table.getByRole('rowgroup').nth(1).getByRole('row').first()).toBeVisible();
    await expect(page.locator('crn-pdf-button')).toBeVisible();
    await expect(page.getByRole('button', { name: t('cwlSelection.state.close') })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t('cwlSelection.excludeAction') })).toHaveCount(0);
  });
});
