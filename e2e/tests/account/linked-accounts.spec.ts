import { messageKeys } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import { expectFieldError, ProfilePage, Shell } from '../../support/pages';
import {
  stack,
  UNKNOWN_PLAYER_TAG,
  VALID_PLAYER_TOKEN,
  VERIFY_UNAVAILABLE_TAG,
} from '../../support/stack';

test.describe('Linking game accounts', () => {
  test('linking a clan member account with its game token opens the clans’ pages at once @cross @P0', async ({
    page,
    users,
    signIn,
  }) => {
    const user = await users.create();
    const account = await users.reserveAccount('member');
    await signIn(user);
    const profile = new ProfilePage(page);
    await profile.goto();
    await expect(page.getByRole('heading', { name: t('profile.access.title') })).toBeVisible();

    // A wrong token is refused on its field and nothing is linked.
    await profile.linkAccount(account.tag, 'not-the-token');
    await expectFieldError(page, t('profile.player.token'), t('ERROR.PLAYER_TOKEN_IS_NOT_VALID'));
    expect((await user.api.me()).players).toEqual([]);

    await profile.linkAccount(account.tag, VALID_PLAYER_TOKEN);
    await expect(profile.playerSection().getByRole('status')).toHaveText(
      t('SUCCESS.PLAYER_LINKED'),
    );
    await expect(profile.playerSection().getByText(account.name!)).toBeVisible();
    // Access opens without signing in again.
    await expect(page.getByRole('heading', { name: t('profile.access.title') })).toBeHidden();
    await expect(new Shell(page).nav().getByRole('link', { name: t('nav.players') })).toBeVisible();
    await page.goto('/players');
    await expect(page).toHaveURL(/\/players/);

    const me = await user.api.me();
    expect(me.players).toEqual([{ tag: account.tag, verified: true }]);
    expect(me.clanAccess).toBe(true);
  });

  test('unknown players and an unavailable game API are reported @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const user = await users.create();
    await signIn(user);
    const profile = new ProfilePage(page);
    await profile.goto();

    await profile.linkAccount(UNKNOWN_PLAYER_TAG, VALID_PLAYER_TOKEN);
    await expectFieldError(page, t('auth.fields.playerTag'), t('ERROR.PLAYER_NOT_FOUND'));

    await profile.linkAccount(VERIFY_UNAVAILABLE_TAG, VALID_PLAYER_TOKEN);
    await expect(profile.playerSection().getByRole('alert')).toHaveText(
      t('ERROR.PLAYER_VERIFICATION_UNAVAILABLE'),
    );

    await profile.linkAccount('not a tag', VALID_PLAYER_TOKEN);
    await expectFieldError(page, t('auth.fields.playerTag'), t('ERROR.PLAYER_TAG_IS_NOT_VALID'));
    expect((await user.api.me()).players).toEqual([]);
  });

  test('an account verified by someone else cannot be linked again @P0', async ({ users }) => {
    const owner = await users.create({ access: 'member' });
    const other = await users.create();
    const reply = await other.api.post('/auth/me/player', {
      playerTag: owner.tag,
      token: VALID_PLAYER_TOKEN,
    });
    expect(reply.status).toBe(409);
    expect(messageKeys(reply)).toContain('ERROR.PLAYER_TAG_ALREADY_LINKED');
    expect((await other.api.me()).clanAccess).toBe(false);
  });

  test('nobody can unlink someone else’s game account through their own profile @P0', async ({
    users,
  }) => {
    const owner = await users.create({ access: 'member' });
    const intruder = await users.create({ access: 'member' });
    // The route acts on the caller's own links only: someone else's tag is not one of them, so the
    // call is the idempotent "nothing to unlink" (200) and changes nothing.
    const reply = await intruder.api.delete(`/auth/me/player/${encodeURIComponent(owner.tag!)}`);
    expect(reply.status).toBe(200);
    // The owner keeps the account and the access it gives; the intruder keeps theirs.
    expect((await owner.api.me()).players).toEqual([{ tag: owner.tag, verified: true }]);
    expect((await owner.api.me()).clanAccess).toBe(true);
    expect((await intruder.api.me()).players).toEqual([{ tag: intruder.tag, verified: true }]);
    const [stored] = await stack.find<{ playerTags: string[] }>(
      'Users',
      { _id: owner.id },
      { playerTags: 1 },
    );
    expect(stored!.playerTags).toEqual([owner.tag]);
  });

  test('an account outside the Crusade links but opens nothing @P1', async ({ users }) => {
    const user = await users.create({ access: 'outside' });
    const me = await user.api.me();
    expect(me.players).toEqual([{ tag: user.tag, verified: true }]);
    expect(me.clanAccess).toBe(false);
    expect((await user.api.get('/players')).status).toBe(403);
  });

  test('unlinking the only clan account closes the clans’ pages @P1', async ({
    page,
    users,
    signIn,
  }) => {
    const member = await users.create({ access: 'member' });
    await signIn(member);
    const profile = new ProfilePage(page);
    await profile.goto();

    await profile
      .playerSection()
      .getByRole('button', { name: t('profile.player.unlinkTag', { tag: member.tag! }) })
      .click();
    await expect(profile.playerSection().getByRole('status')).toHaveText(
      t('SUCCESS.PLAYER_UNLINKED', { tag: member.tag! }),
    );
    await expect(profile.playerSection().getByText(t('profile.player.none'))).toBeVisible();
    await expect(page.getByRole('heading', { name: t('profile.access.title') })).toBeVisible();

    expect((await member.api.get('/players')).status).toBe(403);
    await page.goto('/players');
    await expect(page).toHaveURL(/\/profile$/);
  });
});
