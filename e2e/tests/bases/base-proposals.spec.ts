import { randomBytes } from 'node:crypto';
import { messageKeys } from '../../support/api';
import { basePicture, layoutLink } from '../../support/bases';
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';
import type { TestUser } from '../../support/users';

const TOWN_HALL = 15;

/** A proposal sent through the API (multipart, as the page does). */
async function propose(author: TestUser, description: string, link = layoutLink(TOWN_HALL)) {
  return author.api.call('POST', '/base-proposals', {
    multipart: { layoutUrl: link, description, image: await basePicture() },
  });
}

test.describe('Base arsenal: proposals and moderation', () => {
  test('a member proposes a base with its screenshot, an administrator approves it, everyone sees it @cross @P1', async ({
    page,
    users,
    signIn,
    pageAs,
  }) => {
    const author = await users.create({ access: 'member' });
    const moderator = await users.create({ admin: true });
    const description = `e2e base ${randomBytes(4).toString('hex')}`;
    const link = layoutLink(TOWN_HALL);
    await signIn(author);

    // The member fills the proposal form, with a real picture.
    await page.goto('/bases');
    await page.getByRole('button', { name: t('bases.propose') }).click();
    const dialog = page.getByRole('dialog', { name: t('bases.form.proposeTitle') });
    await dialog.getByLabel(t('bases.form.layoutUrl')).fill(link);
    await expect(
      dialog.getByText(t('bases.form.townHallFromLink', { n: TOWN_HALL })),
    ).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles(await basePicture());
    await expect(dialog.getByRole('img', { name: t('bases.form.imagePreview') })).toBeVisible();
    await dialog.getByLabel(t('bases.form.description')).fill(description);
    await dialog.getByRole('button', { name: t('bases.form.propose') }).click();
    await expect(dialog).toBeHidden();

    // It waits for approval, and is not in the arsenal yet.
    const mine = (await author.api.get('/base-proposals/mine')).body.result as {
      id: string;
      status: string;
      description: string;
    }[];
    const proposal = mine.find((p) => p.description === description)!;
    expect(proposal.status).toBe('PENDING');
    await expect(page.getByText(t('bases.proposals.status.PENDING')).first()).toBeVisible();
    const arsenalBefore = await author.api.get(`/bases?th=${TOWN_HALL}`);
    expect(JSON.stringify(arsenalBefore.body.result)).not.toContain(description);

    // The administrator approves it from the publications page.
    const admin = await pageAs(moderator);
    await admin.goto('/admin/publishing');
    const card = admin.getByRole('listitem').filter({ hasText: author.username });
    await card.getByRole('button', { name: t('baseModeration.approve') }).click();
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: t('baseModeration.approve') })
      .click();
    await expect(card).toBeHidden();

    // Published: the member finds it in the arsenal, with the link to copy it in the game.
    await page.goto(`/bases?th=${TOWN_HALL}`);
    const base = page.getByRole('listitem').filter({ hasText: description });
    await expect(base).toBeVisible();
    await expect(
      base.getByRole('link', { name: t('bases.copyOf', { n: TOWN_HALL }) }),
    ).toHaveAttribute('href', /link\.clashofclans\.com/);
    // The published base is removed by the users' clean-up (also when the test fails half-way).
  });

  test('a rejected proposal shows the reason to its author, who can withdraw it @P1', async ({
    page,
    users,
    signIn,
    sharedAdmin,
  }) => {
    const author = await users.create({ access: 'member' });
    const description = `e2e reject ${randomBytes(4).toString('hex')}`;
    const sent = await propose(author, description);
    expect(sent.status).toBe(201);
    const id = sent.body.result.id as string;

    const admin = await sharedAdmin.api();
    const emptyReason = await admin.post(`/base-proposals/${id}/reject`, { reason: '' });
    expect(emptyReason.status).toBe(400);
    expect(messageKeys(emptyReason)).toContain('ERROR.REJECTION_REASON_SHOULD_NOT_BE_EMPTY');
    const reason = 'Clan castle troops do not fit this town hall';
    expect((await admin.post(`/base-proposals/${id}/reject`, { reason })).status).toBe(200);

    await signIn(author);
    await page.goto('/bases');
    // The panel is closed on arrival; its header counts the rejected proposals.
    const panel = page.getByRole('group').filter({ hasText: t('bases.proposals.title') });
    await expect(panel).toContainText(t('bases.proposals.rejectedCount', { n: 1 }));
    await panel.getByText(t('bases.proposals.title'), { exact: true }).click();
    const card = page.getByRole('listitem').filter({ hasText: reason });
    await expect(card).toBeVisible();
    await expect(
      card.getByText(t('bases.proposals.status.REJECTED'), { exact: true }),
    ).toBeVisible();

    await card
      .getByRole('button', { name: t('bases.proposals.withdrawOf', { n: TOWN_HALL }) })
      .click();
    const withdrawn = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/v1/base-proposals/${id}`),
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t('bases.proposals.withdraw') })
      .click();
    expect((await withdrawn).status()).toBe(200);
    await expect(card).toBeHidden();
    // Gone from the database too.
    const mine = (await author.api.get('/base-proposals/mine')).body.result as { id: string }[];
    expect(mine.map((p) => p.id)).not.toContain(id);
  });

  test('members can neither change nor withdraw someone else’s proposal, nor moderate @P0', async ({
    users,
  }) => {
    const author = await users.create({ access: 'member' });
    const intruder = await users.create({ access: 'member' });
    const sent = await propose(author, `e2e owner ${randomBytes(4).toString('hex')}`);
    const id = sent.body.result.id as string;

    expect(
      (
        await intruder.api.call('PATCH', `/base-proposals/${id}`, {
          multipart: { description: 'mine now' },
        })
      ).status,
    ).toBe(404);
    expect((await intruder.api.delete(`/base-proposals/${id}`)).status).toBe(404);
    expect((await intruder.api.post(`/base-proposals/${id}/approve`)).status).toBe(403);
    expect((await author.api.post(`/base-proposals/${id}/approve`)).status).toBe(403);

    // Still there and unchanged for its author.
    const mine = (await author.api.get('/base-proposals/mine')).body.result as {
      id: string;
      status: string;
      description: string;
    }[];
    expect(mine.find((p) => p.id === id)).toMatchObject({ status: 'PENDING' });
    expect((await author.api.delete(`/base-proposals/${id}`)).status).toBe(200);
  });

  test('invalid links, duplicates and missing pictures are refused @P2', async ({ users }) => {
    const author = await users.create({ access: 'member' });
    const picture = await basePicture();

    const builderBase = await author.api.call('POST', '/base-proposals', {
      multipart: {
        layoutUrl:
          'https://link.clashofclans.com/en?action=OpenLayout&id=BH10%3AHV%3AAAAAFQAAAALxyz123456',
        image: picture,
      },
    });
    expect(builderBase.status).toBe(400);
    expect(messageKeys(builderBase)).toContain('ERROR.LAYOUT_LINK_IS_NOT_VALID');

    const noImage = await author.api.call('POST', '/base-proposals', {
      multipart: { layoutUrl: layoutLink(TOWN_HALL) },
    });
    expect(noImage.status).toBe(400);
    expect(messageKeys(noImage)).toContain('ERROR.IMAGE_SHOULD_NOT_BE_EMPTY');

    const notAnImage = await author.api.call('POST', '/base-proposals', {
      multipart: {
        layoutUrl: layoutLink(TOWN_HALL),
        image: { name: 'base.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') },
      },
    });
    expect(notAnImage.status).toBe(400);
    expect(messageKeys(notAnImage)).toContain('ERROR.IMAGE_IS_NOT_VALID');

    const link = layoutLink(TOWN_HALL);
    const first = await propose(author, 'first', link);
    expect(first.status).toBe(201);
    const again = await propose(author, 'again', link);
    expect(again.status).toBe(409);
    expect(messageKeys(again)).toContain('ERROR.BASE_ALREADY_EXISTS');
  });
});
