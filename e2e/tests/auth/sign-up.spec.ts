import { messageKeys } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { expectFieldError, ProfilePage, Shell, SignUpPage } from '../../support/pages';
import { stack, TEST_EMAIL_DOMAIN } from '../../support/stack';
import { strongPassword, uniqueName } from '../../support/users';

test.describe('Sign-up', () => {
  test('a visitor creates an account, is signed in and gets the confirmation email @cross @P0', async ({
    page,
    api,
  }) => {
    const username = uniqueName('signup');
    const email = `${username}@${TEST_EMAIL_DOMAIN}`;
    const password = strongPassword();
    const signUp = new SignUpPage(page);

    await signUp.goto();
    await signUp.fill({ email, username, password });
    const response = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/sign-up'));
    await signUp.submit().click();
    expect((await response).status()).toBe(201);

    // Signed in at once, on the home page.
    await expect(new Shell(page).accountButton(username)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    // The address is not confirmed yet and the profile says so.
    const profile = new ProfilePage(page);
    await profile.goto();
    await expect(profile.accountSection().getByText(email)).toBeVisible();
    await expect(
      profile.accountSection().getByText(t('profile.account.notVerified')),
    ).toBeVisible();

    // The confirmation email arrived, in the page's language, with a link to this site.
    const link = await stack.waitForLink(email, '/verify-email');
    expect(new URL(link).origin).toBe(new URL(page.url()).origin);

    // The account persists: the same credentials sign in through the API.
    expect((await api.signIn(email, password)).status).toBe(200);
    // The password is stored as a bcrypt hash, never as given.
    const [stored] = await stack.find<{ passwordHash: string }>(
      'Users',
      { email },
      { passwordHash: 1 },
    );
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(stored!.passwordHash).not.toContain(password);
  });

  test('the form checks every field before calling the backend @P1', async ({ page }) => {
    const signUp = new SignUpPage(page);
    const calls: string[] = [];
    page.on('request', (r) => r.url().includes('/auth/sign-up') && calls.push(r.url()));
    await signUp.goto();

    await signUp.submit().click();
    await expectFieldError(page, t('auth.fields.email'), t('ERROR.EMAIL_SHOULD_NOT_BE_EMPTY'));
    await expectFieldError(
      page,
      t('auth.fields.username'),
      t('ERROR.USERNAME_SHOULD_NOT_BE_EMPTY'),
    );
    await expectFieldError(
      page,
      t('auth.fields.password'),
      t('ERROR.PASSWORD_SHOULD_NOT_BE_EMPTY'),
    );

    await signUp.fill({
      email: 'not-an-email',
      username: 'a b',
      password: 'short',
      repeatPassword: 'other',
    });
    await signUp.submit().click();
    await expectFieldError(page, t('auth.fields.email'), t('ERROR.EMAIL_MUST_BE_AN_EMAIL'));
    await expectFieldError(page, t('auth.fields.username'), t('ERROR.USERNAME_IS_NOT_VALID'));
    await expectFieldError(
      page,
      t('auth.fields.password'),
      t('ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH'),
    );
    await expectFieldError(
      page,
      t('auth.fields.repeatPassword'),
      t('ERROR.PASSWORDS_DO_NOT_MATCH'),
    );

    expect(calls, 'no sign-up request with invalid input').toEqual([]);
  });

  test('an email or username already taken is reported on its field @P0', async ({
    page,
    users,
  }) => {
    const existing = await users.create();
    const signUp = new SignUpPage(page);
    await signUp.goto();
    // Same address and username with a different case: both are unique regardless of case.
    await signUp.fill({
      email: existing.email.toUpperCase(),
      username: existing.username.toUpperCase(),
      password: strongPassword(),
    });
    await signUp.submit().click();

    await expectFieldError(page, t('auth.fields.email'), t('ERROR.EMAIL_IS_ALREADY_TAKEN'));
    await expectFieldError(page, t('auth.fields.username'), t('ERROR.USERNAME_IS_ALREADY_TAKEN'));
    await expect(new Shell(page).signInLink()).toBeVisible();
  });

  test('the backend validates the input on its own and ignores fields it does not expect @P0', async ({
    api,
  }) => {
    const username = uniqueName('raw');
    const base = {
      email: `${username}@${TEST_EMAIL_DOMAIN}`,
      username,
      password: strongPassword(),
    };

    const weak = await api.post('/auth/sign-up', {
      ...base,
      password: 'abcdefgh',
      repeatPassword: 'abcdefgh',
    });
    expect(weak.status).toBe(400);
    expect(messageKeys(weak)).toContain('ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH');

    const mismatch = await api.post('/auth/sign-up', {
      ...base,
      repeatPassword: `${base.password}x`,
    });
    expect(mismatch.status).toBe(400);
    expect(messageKeys(mismatch)).toContain('ERROR.PASSWORDS_DO_NOT_MATCH');

    const badName = await api.post('/auth/sign-up', {
      ...base,
      username: '<script>',
      repeatPassword: base.password,
    });
    expect(badName.status).toBe(400);
    expect(messageKeys(badName)).toContain('ERROR.USERNAME_IS_NOT_VALID');

    // Mass assignment: roles, verification and links sent by the client are ignored.
    const sneaky = await api.post('/auth/sign-up', {
      ...base,
      repeatPassword: base.password,
      roles: ['ADMIN'],
      emailVerified: true,
      playerTags: ['#NERAE06'],
    });
    expect(sneaky.status).toBe(201);
    expect(sneaky.body.result.user).toMatchObject({
      roles: ['USER'],
      emailVerified: false,
      players: [],
      clanAccess: false,
    });
    expect(JSON.stringify(sneaky.body)).not.toContain('passwordHash');
  });
});
