import type { Page } from '@playwright/test';
import type { ApiClient } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { knownBug } from '../../support/known-bugs';

/** Kind switched in the test: no sync runs while the suite runs, so no draft depends on it. */
const KIND = 'donations';

/** Whether drafts of `kind` are on, as saved by the backend. */
async function enabled(api: ApiClient, kind: string): Promise<boolean> {
  const reply = await api.get<{ kinds: { kind: string; enabled: boolean }[] }>(
    '/admin/announcements/settings',
  );
  expect(reply.status).toBe(200);
  const value = reply.body.result?.kinds.find((k) => k.kind === kind)?.enabled;
  expect(typeof value, `setting of ${kind}`).toBe('boolean');
  return value!;
}

/** The announcement settings form of the publications page. */
function settingsForm(page: Page) {
  return page.getByRole('region', { name: t('announcementsAdmin.settings.title') });
}

test.describe('Publications', () => {
  test('switching a kind of announcement draft is saved and kept @P2', async ({
    page,
    users,
    signIn,
  }) => {
    const admin = await users.create({ admin: true });
    await signIn(admin);
    // A setting shared by the whole stack: whatever happens, it goes back to what it was.
    const initial = await enabled(admin.api, KIND);
    try {
      await page.goto('/admin/publishing?tab=announcements');
      const form = settingsForm(page);
      const toggle = form
        .getByRole('listitem')
        .filter({ hasText: t(`announcementsAdmin.kind.${KIND}`) })
        .getByRole('switch');
      const save = form.getByRole('button', { name: t('announcementsAdmin.settings.save') });
      await expect(toggle).toBeChecked({ checked: initial });

      await toggle.click();
      await save.click();
      await expect(form.getByRole('status')).toBeVisible();
      await expect.poll(() => enabled(admin.api, KIND)).toBe(!initial);

      await page.reload();
      await expect(toggle).toBeChecked({ checked: !initial });

      await toggle.click();
      await save.click();
      await expect.poll(() => enabled(admin.api, KIND)).toBe(initial);
    } finally {
      const restored = await admin.api.put('/admin/announcements/settings', {
        kinds: [{ kind: KIND, enabled: initial }],
      });
      expect(restored.status, 'setting restored').toBe(200);
      expect(await enabled(admin.api, KIND), 'setting restored').toBe(initial);
    }
  });

  test('the draft switches have no accessible name (BUG-02) @P2 @known-bug', async ({
    page,
    users,
    signIn,
  }) => {
    const bug = knownBug(
      'BUG-02',
      'announcement-settings-form.html binds [attr.aria-labelledby] and [attr.aria-describedby] on <mat-slide-toggle>: Material removes the first from the host and the second stays on the host, so the role="switch" button gets neither name nor description',
    );
    await signIn(await users.create({ admin: true }));
    await page.goto('/admin/publishing?tab=announcements');
    const kindName = t(`announcementsAdmin.kind.${KIND}`);
    const row = settingsForm(page).getByRole('listitem').filter({ hasText: kindName });
    const toggle = row.getByRole('switch');
    await expect(toggle).toHaveCount(1);

    // The kind's name and its "when" text are on the page, next to the switch.
    await expect(row.getByText(kindName, { exact: true })).toBeVisible();

    // Correct behaviour: the switch is announced with the kind's name and described by its "when"
    // text. Today (BUG-02) it gets neither:
    await expect(toggle, bug('the switch has no accessible name')).toHaveAccessibleName('');
    await expect(toggle, bug('the switch has no description')).toHaveAccessibleDescription('');
    await expect(
      page.getByRole('switch', { name: kindName, exact: true }),
      bug('no switch carries the kind’s name'),
    ).toHaveCount(0);
  });

  test('the publications page tells that Telegram is not configured, without failing @P3', async ({
    page,
    users,
    signIn,
  }) => {
    await signIn(await users.create({ admin: true }));
    await page.goto('/admin/publishing?tab=channels');
    await expect(page.getByText(t('telegramAdmin.notConfigured'), { exact: true })).toBeVisible();
  });
});
