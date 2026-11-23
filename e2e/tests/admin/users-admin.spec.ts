import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { knownBug } from '../../support/known-bugs';
import { stack } from '../../support/stack';
import type { TestUser } from '../../support/users';

/**
 * The row of `user` in the administration table, found with the table's own user filter. Waits for
 * the filtered page: the first, unfiltered page may list the user too, and acting on it while the
 * filtered page is on its way is a different scenario (see OBS-01 in e2e/STRATEGY.md).
 */
async function userRow(page: Page, user: TestUser): Promise<Locator> {
  await page.goto('/admin');
  const table = page.getByRole('table', { name: new RegExp(t('admin.users')) });
  await table.getByRole('button', { name: t('table.showFilters') }).click();
  const filtered = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/admin/users?') &&
      new URL(r.url()).searchParams.get('user') === user.username,
  );
  await table
    .getByRole('searchbox', { name: t('table.filterBy', { name: t('admin.columns.user') }) })
    .fill(user.username);
  expect((await filtered).status()).toBe(200);
  const rows = table.getByRole('rowgroup').nth(1).getByRole('row');
  await expect(rows).toHaveCount(1);
  const row = rows.filter({ hasText: user.username });
  await expect(row).toHaveCount(1);
  return row;
}

test.describe('Administration of users', () => {
  test('an administrator grants and removes the ADMIN role; it applies at once @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const admin = await users.create({ admin: true });
    const target = await users.create({ access: 'member' });
    await signIn(admin);

    const row = await userRow(page, target);
    // One switch per row (unnamed: BUG-02, see below).
    const toggle = row.getByRole('switch');
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    // Saved, and the target's sessions are closed so the new role takes effect.
    await expect
      .poll(
        async () =>
          (await stack.find<{ roles: string[] }>('Users', { _id: target.id }, { roles: 1 }))[0]!
            .roles,
      )
      .toContain('ADMIN');
    expect((await target.api.refresh()).status).toBe(401);
    expect(
      (await target.api.signIn(target.username, target.password)).body.result!.user.roles,
    ).toContain('ADMIN');
    expect((await target.api.get('/admin/users')).status).toBe(200);

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(async () => (await target.api.get('/admin/users')).status).toBe(403);
  });

  test('an administrator links a game account to a user, without the game token @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const admin = await users.create({ admin: true });
    const target = await users.create();
    const account = await users.reserveAccount('member');
    await signIn(admin);

    const row = await userRow(page, target);
    await row
      .getByRole('button', { name: t('admin.actions.linkOf', { name: target.username }) })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill(account.tag);
    await dialog.getByRole('textbox').press('Enter');
    await dialog.getByRole('button', { name: t('admin.actions.link'), exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(account.tag);

    const me = await target.api.me();
    expect(me.players).toEqual([{ tag: account.tag, verified: true }]);
    expect(me.clanAccess).toBe(true);
  });

  test('deleting a user needs their name typed again, and signs them out everywhere @P1', async ({
    page,
    users,
    signIn,
    api,
  }) => {
    const admin = await users.create({ admin: true });
    const target = await users.create({ access: 'member' });
    await signIn(admin);

    const row = await userRow(page, target);
    await row
      .getByRole('button', { name: t('admin.actions.deleteOf', { name: target.username }) })
      .click();
    const dialog = page.getByRole('dialog', { name: t('admin.deleteDialog.title') });
    const confirm = dialog.getByRole('button', { name: t('admin.actions.delete'), exact: true });
    await dialog
      .getByLabel(t('admin.deleteDialog.label', { name: target.username }))
      .fill(`${target.username}x`);
    await expect(confirm).toBeDisabled();
    await dialog
      .getByLabel(t('admin.deleteDialog.label', { name: target.username }))
      .fill(target.username);
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);

    expect(await stack.find('Users', { _id: target.id })).toEqual([]);
    expect(await stack.find('Sessions', { userId: target.id })).toEqual([]);
    expect(
      (await api.post('/auth/sign-in', { identifier: target.username, password: target.password }))
        .status,
    ).toBe(401);
  });

  test('the ADMIN switch of each row has no accessible name (BUG-02) @P2 @known-bug', async ({
    page,
    users,
    signIn,
  }) => {
    const bug = knownBug(
      'BUG-02',
      'admin-page.html binds [attr.aria-label] on <mat-slide-toggle>, whose own host binding removes it: the label is lost and the role="switch" button is named by the toggle’s empty <label>',
    );
    const admin = await users.create({ admin: true });
    const target = await users.create();
    await signIn(admin);
    const row = await userRow(page, target);
    const intended = t('admin.adminToggle', { name: target.username });
    const toggle = row.getByRole('switch');
    await expect(toggle).toHaveCount(1);

    // Correct behaviour: the switch itself is announced as `intended`. Today (BUG-02) the label
    // is dropped (Material removes the host's aria-label) and the switch has no name at all:
    await expect(toggle, bug('the switch has no accessible name')).toHaveAccessibleName('');
    await expect(
      row.getByLabel(intended, { exact: true }),
      bug('the intended label is nowhere in the row'),
    ).toHaveCount(0);
  });

  test('the administrator’s own row cannot be demoted or deleted from the page @P2', async ({
    page,
    users,
    signIn,
  }) => {
    const admin = await users.create({ admin: true });
    await signIn(admin);
    const row = await userRow(page, admin);
    await expect(row.getByRole('switch')).toBeDisabled();
    await expect(
      row.getByRole('button', { name: t('admin.actions.deleteOf', { name: admin.username }) }),
    ).toBeDisabled();
  });
});
