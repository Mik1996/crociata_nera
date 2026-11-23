import { messageKeys } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { expectFieldError, ProfilePage, Shell } from '../../support/pages';
import { stack, TEST_EMAIL_DOMAIN } from '../../support/stack';
import { strongPassword, uniqueName } from '../../support/users';

test.describe('Email confirmation', () => {
  test('the link of the email confirms the address, once @cross @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const user = await users.create();
    await signIn(user);
    const link = await stack.waitForLink(user.email, '/verify-email');

    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.getByRole('status').filter({ hasText: t('auth.verify.done') })).toBeVisible();

    const profile = new ProfilePage(page);
    await profile.goto();
    await expect(
      profile.accountSection().getByText(t('profile.account.verified'), { exact: true }),
    ).toBeVisible();
    expect((await user.api.me()).emailVerified).toBe(true);

    // The token is single use.
    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.getByRole('alert')).toHaveText(t('ERROR.INVALID_OR_EXPIRED_VERIFY_TOKEN'));
  });

  test('a forged token is refused @P1', async ({ page }) => {
    await page.goto('/verify-email?token=forged-token-that-was-never-sent');
    await expect(page.getByRole('alert')).toHaveText(t('ERROR.INVALID_OR_EXPIRED_VERIFY_TOKEN'));
  });

  test('"send again" from the profile mails a new link and voids the previous one @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const user = await users.create();
    await signIn(user);
    const first = await stack.waitForLink(user.email, '/verify-email', 0);

    const profile = new ProfilePage(page);
    await profile.goto();
    await profile
      .accountSection()
      .getByRole('button', { name: t('profile.account.resend') })
      .click();
    await expect(profile.accountSection().getByRole('status')).toHaveText(
      t('SUCCESS.VERIFICATION_EMAIL_SENT'),
    );
    const second = await stack.waitForLink(user.email, '/verify-email', 1);
    expect(second).not.toBe(first);

    const token = (link: string) => new URL(link).searchParams.get('token');
    expect((await user.api.post('/auth/verify-email', { token: token(first) })).status).toBe(400);
    expect((await user.api.post('/auth/verify-email', { token: token(second) })).status).toBe(200);

    // Already confirmed: nothing more to send.
    const again = await user.api.post('/auth/verify-email/resend', { language: 'en-US' });
    expect(again.status).toBe(409);
    expect(messageKeys(again)).toContain('ERROR.EMAIL_ALREADY_VERIFIED');
  });
});

test.describe('Forgotten password', () => {
  test('a reset link sets a new password and signs out every device @cross @P0', async ({
    page,
    users,
    api,
  }) => {
    const user = await users.create();
    const newPassword = strongPassword();

    await page.goto('/forgot-password');
    await page.getByLabel(t('auth.fields.email')).fill(user.email);
    await page.getByRole('button', { name: t('auth.forgot.submit') }).click();
    await expect(page.getByRole('status')).toHaveText(t('auth.forgot.sent', { email: user.email }));

    const link = await stack.waitForLink(user.email, '/reset-password');
    await page.goto(new URL(link).pathname + new URL(link).search);
    await page.getByRole('textbox', { name: t('auth.fields.newPassword') }).fill(newPassword);
    await page.getByRole('textbox', { name: t('auth.fields.repeatPassword') }).fill(newPassword);
    await page.getByRole('button', { name: t('auth.reset.submit') }).click();
    await expect(page.getByRole('status')).toHaveText(t('auth.reset.done'));

    // The session opened at sign-up is gone; the old password no longer works, the new one does.
    expect((await user.api.refresh()).status).toBe(401);
    expect(
      (await api.post('/auth/sign-in', { identifier: user.username, password: user.password }))
        .status,
    ).toBe(401);
    const signedIn = await api.signIn(user.username, newPassword);
    expect(signedIn.status).toBe(200);
    // Receiving the link proved the address.
    expect(signedIn.body.result!.user.emailVerified).toBe(true);

    // The link works once.
    const again = await api.post('/auth/reset-password', {
      token: new URL(link).searchParams.get('token'),
      password: newPassword,
      repeatPassword: newPassword,
    });
    expect(again.status).toBe(400);
    expect(messageKeys(again)).toContain('ERROR.INVALID_OR_EXPIRED_RESET_TOKEN');
  });

  test('the answer is the same for unknown addresses, and no email is sent to them @P0', async ({
    api,
    users,
  }) => {
    const user = await users.create();
    const unknown = `${uniqueName('ghost')}@${TEST_EMAIL_DOMAIN}`;

    const forUnknown = await api.post('/auth/forgot-password', {
      email: unknown,
      language: 'en-US',
    });
    const forKnown = await api.post('/auth/forgot-password', {
      email: user.email,
      language: 'en-US',
    });
    expect(forUnknown.status).toBe(forKnown.status);
    expect(forUnknown.body).toEqual(forKnown.body);

    await stack.waitForLink(user.email, '/reset-password');
    expect(await stack.mails(unknown)).toEqual([]);
  });

  test('a page opened without a token explains what to do @P2', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('alert')).toHaveText(t('auth.reset.missingToken'));
    await expect(page.getByRole('link', { name: t('auth.reset.newLink') })).toBeVisible();
  });
});

test.describe('Password change', () => {
  test('checks the current password, keeps this device signed in and signs out the others @P0', async ({
    page,
    users,
    signIn,
    api,
  }) => {
    const user = await users.create();
    await signIn(user);
    const profile = new ProfilePage(page);
    await profile.goto();
    const next = strongPassword();

    await profile.changePassword('Not-the-password-1', next);
    await expectFieldError(page, t('auth.fields.currentPassword'), t('ERROR.INCORRECT_PASSWORD'));

    await profile.changePassword(user.password, next);
    await expect(profile.passwordSection().getByRole('status')).toHaveText(
      t('SUCCESS.PASSWORD_UPDATED'),
    );

    // This device stays signed in…
    await page.reload();
    await expect(new Shell(page).accountButton(user.username)).toBeVisible();
    // …the session of the sign-up (another device) is closed in the database.
    const sessions = await stack.find<{ revokedReason: string | null }>(
      'Sessions',
      { userId: user.id },
      { revokedReason: 1 },
    );
    expect(sessions.map((s) => s.revokedReason)).toContain('revoked');
    expect(
      (await api.post('/auth/sign-in', { identifier: user.username, password: user.password }))
        .status,
    ).toBe(401);
    expect(
      (await api.post('/auth/sign-in', { identifier: user.username, password: next })).status,
    ).toBe(200);
  });

  test('the device that changed the password stays signed in when another device comes back @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const user = await users.create();
    const shell = new Shell(page);
    const liveSessions = async () =>
      (await stack.find('Sessions', { userId: user.id, revokedAt: null }, { _id: 1 })).length;

    await signIn(user);
    const profile = new ProfilePage(page);
    await profile.goto();
    await profile.changePassword(user.password, strongPassword());
    await expect(profile.passwordSection().getByRole('status')).toHaveText(
      t('SUCCESS.PASSWORD_UPDATED'),
    );
    // As intended so far: this device is still signed in, with a live session.
    await page.reload();
    await expect(shell.accountButton(user.username)).toBeVisible();
    expect(await liveSessions(), 'this device keeps its session after the change').toBe(1);

    // The other device (signed in at sign-up) opens the site again: its old session is refused.
    const comeback = await user.api.refresh();
    expect(comeback.status).toBe(401);
    expect(messageKeys(comeback)).toContain('ERROR.INVALID_REFRESH_TOKEN');

    // …without closing this device's session (BUG-01, fixed): still signed in after a reload.
    expect(await liveSessions(), 'this device keeps its session').toBe(1);
    await page.reload();
    await expect(shell.accountButton(user.username)).toBeVisible();
    await expect(shell.signInLink()).toBeHidden();
  });
});
