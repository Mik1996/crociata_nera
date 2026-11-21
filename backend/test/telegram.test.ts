import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getStatus } from '@/app/api/v1/admin/telegram/route';
import { DELETE as removeChat, PATCH as updateChat } from '@/app/api/v1/admin/telegram/chats/[chatId]/route';
import { POST as addChat } from '@/app/api/v1/admin/telegram/chats/route';
import { POST as syncPosts } from '@/app/api/v1/admin/telegram/sync/route';
import { POST as approve } from '@/app/api/v1/base-proposals/[id]/approve/route';
import { GET as listProposals, POST as propose } from '@/app/api/v1/base-proposals/route';
import { DELETE as deleteBase, PATCH as updateBase } from '@/app/api/v1/bases/[id]/route';
import { POST as createBase } from '@/app/api/v1/bases/route';
import { POST as webhook } from '@/app/api/v1/telegram/webhook/route';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { resetEnvCache } from '@/lib/config/env';
import { resetTelegramBot } from '@/lib/telegram/telegram-client';
import { Types } from 'mongoose';
import { UserModel } from '@/modules/auth/user.model';
import { BaseImageModel } from '@/modules/bases/base-image.store';
import { DefenseBaseModel } from '@/modules/bases/defense-base.model';
import { PlayerModel } from '@/modules/commendations/player.model';
import { authorNameOf, basePostCaption, TELEGRAM_CAPTION_LIMIT } from '@/modules/telegram/base-post-caption';
import { requestBasePostSync, setTelegramSendInterval } from '@/modules/telegram/base-posts.service';
import { BasePostStatus, TelegramBasePostModel } from '@/modules/telegram/telegram-base-post.model';
import { TelegramChatModel } from '@/modules/telegram/telegram-chat.model';
import { call, memberToken } from './helpers';
import { mockTelegramApi, TELEGRAM_TEST_BASE_URL } from './telegram-mock';

const SECRET = 'webhook-secret-that-is-at-least-32-characters';
const TH18_CHANNEL = -1001800;
const TH17_CHANNEL = -1001700;

const link = (th: number, id = 'AAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd') =>
  `https://link.clashofclans.com/en?action=OpenLayout&id=TH${th}%3AHV%3A${id}`;

function png(color = { r: 40, g: 120, b: 60 }): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: color } })
    .png()
    .toBuffer();
}

function form(fields: Record<string, string | Buffer | undefined>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === 'string') data.append(name, value);
    else data.append(name, new Blob([new Uint8Array(value)]), 'base.png');
  }
  return data;
}

async function adminToken(playerTags: string[] = []) {
  const user = await UserModel.create({
    email: 'boss@x.io',
    username: 'boss',
    usernameKey: 'boss',
    passwordHash: 'x',
    roles: [UserRole.USER, UserRole.ADMIN],
    playerTags,
  });
  return (await signAccessToken({ sub: user._id.toString(), roles: [UserRole.USER, UserRole.ADMIN] })).token;
}

async function create(token: string, th = 18, extra: Record<string, string | Buffer> = {}, id?: string) {
  const res = await call(createBase, { token, body: form({ layoutUrl: link(th, id), image: await png(), ...extra }) });
  expect(res.status).toBe(201);
  await requestBasePostSync();
  return res.body.result.id as string;
}

async function channel(chatId: number, townHallLevel: number | null, extra: Record<string, unknown> = {}) {
  await TelegramChatModel.create({
    chatId,
    title: `Arsenale basi TH${townHallLevel}`,
    type: 'channel',
    botStatus: 'administrator',
    canPost: true,
    townHallLevel,
    ...extra,
  });
}

const postOf = (baseId: string) => TelegramBasePostModel.findOne({ baseId }).lean();

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = '123:test-bot-token';
  process.env.TELEGRAM_API_BASE_URL = TELEGRAM_TEST_BASE_URL;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  resetEnvCache();
  resetTelegramBot();
  setTelegramSendInterval(0);
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_API_BASE_URL;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  resetEnvCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('caption of a base post', () => {
  it('shows the town hall, the clan castle, the description and the author, escaped', () => {
    expect(
      basePostCaption({
        townHallLevel: 18,
        clanCastleTroops: [
          { name: 'Ice Golem', count: 2 },
          { name: 'Witch', count: 1 },
        ],
        description: 'Anti <root> rider & co.',
        authorName: 'Mario <3',
      }),
    ).toBe(
      [
        '🏰 <b>Base TH18</b>',
        '🛡️ Castello del clan: 2× Ice Golem, 1× Witch',
        '📝 Anti &lt;root&gt; rider &amp; co.',
        '👤 Proposta da <b>Mario &lt;3</b>',
        '#TH18',
      ].join('\n\n'),
    );
  });

  it('leaves out the lines without content', () => {
    expect(basePostCaption({ townHallLevel: 17, clanCastleTroops: [], description: '  ', authorName: null })).toBe(
      '🏰 <b>Base TH17</b>\n\n#TH17',
    );
  });

  it('cuts a description too long for Telegram, ending it with "..."', () => {
    const caption = basePostCaption({
      townHallLevel: 18,
      clanCastleTroops: [{ name: 'Golem', count: 1 }],
      description: 'x'.repeat(2000),
      authorName: 'Mario',
    });
    const text = caption.replace(/<\/?b>/g, '');
    expect(text.length).toBe(TELEGRAM_CAPTION_LIMIT);
    expect(text).toContain('x...\n\n👤 Proposta da Mario\n\n#TH18');
  });
});

describe('author of a base post', () => {
  async function userWith(tags: string[]) {
    const user = await UserModel.create({
      email: 'a@x.io',
      username: 'a',
      usernameKey: 'a',
      passwordHash: 'x',
      roles: [UserRole.USER],
      playerTags: tags,
    });
    return user._id;
  }

  it('is the linked account with the highest role, then the highest town hall', async () => {
    await PlayerModel.create([
      { tag: '#P1', name: 'Member TH18', role: 'member', townHallLevel: 18, inClan: true },
      { tag: '#P2', name: 'Elder TH15', role: 'admin', townHallLevel: 15, inClan: true },
      { tag: '#P3', name: 'Elder TH17', role: 'admin', townHallLevel: 17, inClan: true },
      { tag: '#P4', name: 'Old leader', role: 'leader', townHallLevel: 18, inClan: false },
    ]);
    expect(await authorNameOf(await userWith(['#P1', '#P2', '#P3', '#P4']))).toBe('Elder TH17');
  });

  it('falls back on accounts out of the clan, and is null without known accounts', async () => {
    await PlayerModel.create({ tag: '#P4', name: 'Old leader', role: 'leader', townHallLevel: 18, inClan: false });
    expect(await authorNameOf(await userWith(['#P4', '#UNKNOWN']))).toBe('Old leader');
    await UserModel.deleteMany({});
    expect(await authorNameOf(await userWith([]))).toBeNull();
    expect(await authorNameOf(null)).toBeNull();
  });
});

describe('posts of the bases', () => {
  it('posts a new base in the channel of its town hall, with picture, caption and copy button', async () => {
    const telegram = mockTelegramApi();
    await PlayerModel.create({ tag: '#BOSS1', name: 'Boss', role: 'leader', townHallLevel: 18, inClan: true });
    const admin = await adminToken(['#BOSS1']);
    await channel(TH18_CHANNEL, 18);
    const id = await create(admin, 18, {
      description: 'Anti air',
      clanCastleTroops: JSON.stringify([{ name: 'Ice Golem', count: 1 }]),
    });

    const [sent, ...others] = telegram.of('sendPhoto');
    expect(others).toEqual([]);
    expect(sent!.params).toMatchObject({
      chat_id: String(TH18_CHANNEL),
      parse_mode: 'HTML',
      caption: '🏰 <b>Base TH18</b>\n\n🛡️ Castello del clan: 1× Ice Golem\n\n📝 Anti air\n\n👤 Proposta da <b>Boss</b>\n\n#TH18',
    });
    expect(JSON.parse(sent!.params.reply_markup as string)).toEqual({
      inline_keyboard: [[{ text: '📋 Copia la base', url: link(18) }]],
    });
    const photo = sent!.params.photo as Blob;
    expect(photo.type).toBe('image/jpeg');
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format).toBe('jpeg');

    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.SENT, chatId: TH18_CHANNEL, messageId: 100 });
    // Nothing changed: a new run sends nothing.
    telegram.reset();
    await requestBasePostSync();
    expect(telegram.calls).toEqual([]);
  });

  it('keeps a base waiting while its town hall has no channel, and posts it once one is bound', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    await channel(-1001900, null, { title: 'Arsenale basi TH19' });
    const id = await create(admin, 19);
    expect(telegram.of('sendPhoto')).toEqual([]);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.NO_CHANNEL, chatId: null });

    const status = await call(getStatus, { token: admin });
    expect(status.body.result.basePosts).toMatchObject({ sent: 0, waiting: [{ townHallLevel: 19, bases: 1 }], failed: [], pending: 0 });

    const res = await call(updateChat, { token: admin, method: 'PATCH', params: { chatId: '-1001900' }, body: { townHallLevel: 19 } });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ chatId: -1001900, townHallLevel: 19 });
    await requestBasePostSync();
    expect(telegram.of('sendPhoto').map((c) => c.params.chat_id)).toEqual(['-1001900']);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.SENT, chatId: -1001900 });
  });

  it('follows the changes of the base: caption, picture, town hall, deletion', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    await channel(TH17_CHANNEL, 17);
    const id = await create(admin);
    telegram.reset();

    await call(updateBase, { token: admin, method: 'PATCH', params: { id }, body: form({ description: 'New text' }) });
    await requestBasePostSync();
    expect(telegram.calls.map((c) => c.method)).toEqual(['editMessageCaption']);
    expect(telegram.calls[0]!.params).toMatchObject({ chat_id: TH18_CHANNEL, message_id: 100, caption: '🏰 <b>Base TH18</b>\n\n📝 New text\n\n#TH18' });

    telegram.reset();
    await call(updateBase, { token: admin, method: 'PATCH', params: { id }, body: form({ image: await png({ r: 200, g: 10, b: 10 }) }) });
    await requestBasePostSync();
    expect(telegram.calls.map((c) => c.method)).toEqual(['editMessageMedia']);
    expect(JSON.parse(telegram.calls[0]!.params.media as string)).toMatchObject({ type: 'photo', media: 'attach://photo' });

    telegram.reset();
    await call(updateBase, { token: admin, method: 'PATCH', params: { id }, body: form({ layoutUrl: link(17, 'CCCC17xx') }) });
    await requestBasePostSync();
    expect(telegram.calls.map((c) => [c.method, c.params.chat_id])).toEqual([
      ['deleteMessage', TH18_CHANNEL],
      ['sendPhoto', String(TH17_CHANNEL)],
    ]);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.SENT, chatId: TH17_CHANNEL, townHallLevel: 17, messageId: 101 });

    telegram.reset();
    await call(deleteBase, { token: admin, method: 'DELETE', params: { id } });
    await requestBasePostSync();
    expect(telegram.calls.map((c) => [c.method, c.params.chat_id, c.params.message_id])).toEqual([['deleteMessage', TH17_CHANNEL, 101]]);
    expect(await TelegramBasePostModel.countDocuments()).toBe(0);
  });

  it('posts bases saved before the clan castle existed, and one broken base does not stop the others', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const old = await create(admin, 18, {}, 'AAAA18aa');
    const broken = await create(admin, 18, {}, 'BBBB18bb');
    const last = await create(admin, 18, {}, 'CCCC18cc');
    await TelegramBasePostModel.deleteMany({});
    telegram.reset();
    // An old base without the fields, and one whose image is unreadable (not an API error).
    await DefenseBaseModel.collection.updateOne({ _id: new Types.ObjectId(old) }, { $unset: { clanCastleTroops: '', description: '' } });
    const { imageKey } = (await DefenseBaseModel.findById(broken).lean())!;
    await BaseImageModel.updateOne({ key: imageKey, variant: 'full' }, { $set: { data: Buffer.from('not an image') } });

    await requestBasePostSync();
    expect(telegram.of('sendPhoto').map((c) => c.params.caption)).toEqual(['🏰 <b>Base TH18</b>\n\n#TH18', '🏰 <b>Base TH18</b>\n\n#TH18']);
    expect(await postOf(old)).toMatchObject({ status: BasePostStatus.SENT });
    expect(await postOf(broken)).toMatchObject({ status: BasePostStatus.FAILED });
    expect(await postOf(last)).toMatchObject({ status: BasePostStatus.SENT });
  });

  it('sends the post again when it was deleted by hand in the channel', async () => {
    const telegram = mockTelegramApi({
      editMessageCaption: () => ({ error: 400, description: 'Bad Request: message to edit not found' }),
    });
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const id = await create(admin);
    await call(updateBase, { token: admin, method: 'PATCH', params: { id }, body: form({ description: 'Changed' }) });
    await requestBasePostSync();
    expect(telegram.calls.map((c) => c.method)).toEqual(['sendPhoto', 'editMessageCaption', 'sendPhoto']);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.SENT, messageId: 101 });
  });

  it('deletes the posts of a channel that is unbound or removed: they wait for a new channel', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const id = await create(admin);
    telegram.reset();
    await call(updateChat, { token: admin, method: 'PATCH', params: { chatId: String(TH18_CHANNEL) }, body: { townHallLevel: null } });
    await requestBasePostSync();
    expect(telegram.calls.map((c) => [c.method, c.params.chat_id, c.params.message_id])).toEqual([['deleteMessage', TH18_CHANNEL, 100]]);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.NO_CHANNEL, chatId: null, messageId: null });

    await call(updateChat, { token: admin, method: 'PATCH', params: { chatId: String(TH18_CHANNEL) }, body: { townHallLevel: 18 } });
    await requestBasePostSync();
    telegram.reset();
    expect((await call(removeChat, { token: admin, method: 'DELETE', params: { chatId: String(TH18_CHANNEL) } })).status).toBe(200);
    await requestBasePostSync();
    expect(telegram.calls.map((c) => [c.method, c.params.chat_id])).toEqual([['deleteMessage', TH18_CHANNEL]]);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.NO_CHANNEL, chatId: null });
  });

  it('moves the posts when two channels swap town halls: every base stays in one channel only', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    await channel(TH17_CHANNEL, 17);
    const th18 = await create(admin, 18, {}, 'AAAA18xx');
    const th17 = await create(admin, 17, {}, 'AAAA17xx');
    const patch = (chatId: number, townHallLevel: number | null) =>
      call(updateChat, { token: admin, method: 'PATCH', params: { chatId: String(chatId) }, body: { townHallLevel } });

    expect((await patch(TH17_CHANNEL, null)).status).toBe(200);
    expect((await patch(TH18_CHANNEL, 17)).status).toBe(200);
    expect((await patch(TH17_CHANNEL, 18)).status).toBe(200);
    await requestBasePostSync();

    expect(await postOf(th18)).toMatchObject({ status: BasePostStatus.SENT, chatId: TH17_CHANNEL });
    expect(await postOf(th17)).toMatchObject({ status: BasePostStatus.SENT, chatId: TH18_CHANNEL });
    // Every message sent is deleted, except the last one of each base.
    const sent = telegram.of('sendPhoto').length;
    expect(telegram.of('deleteMessage')).toHaveLength(sent - 2);
  });

  it('moves a base out of a channel the bot was removed from, without deleting the post it cannot reach', async () => {
    const telegram = mockTelegramApi({
      deleteMessage: (params) =>
        params.chat_id === TH18_CHANNEL ? { error: 403, description: 'Forbidden: bot is not a member of the channel chat' } : undefined,
    });
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    await channel(TH17_CHANNEL, null);
    const id = await create(admin);
    await TelegramChatModel.updateOne({ chatId: TH18_CHANNEL }, { $set: { townHallLevel: null } });
    await TelegramChatModel.updateOne({ chatId: TH17_CHANNEL }, { $set: { townHallLevel: 18 } });
    telegram.reset();
    await requestBasePostSync();
    expect(telegram.calls.map((c) => [c.method, c.params.chat_id])).toEqual([
      ['deleteMessage', TH18_CHANNEL],
      ['sendPhoto', String(TH17_CHANNEL)],
    ]);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.SENT, chatId: TH17_CHANNEL });
    expect(await TelegramChatModel.findOne({ chatId: TH18_CHANNEL }).lean()).toMatchObject({ canPost: false });
  });

  it('leaves the posts in a bound channel the bot can no longer write in, and keeps the new ones waiting', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const first = await create(admin, 18, {}, 'AAAA0001');
    await TelegramChatModel.updateOne({ chatId: TH18_CHANNEL }, { $set: { canPost: false } });
    telegram.reset();
    const second = await create(admin, 18, {}, 'AAAA0002');
    expect(telegram.calls).toEqual([]);
    expect(await postOf(first)).toMatchObject({ status: BasePostStatus.SENT, chatId: TH18_CHANNEL });
    expect(await postOf(second)).toMatchObject({ status: BasePostStatus.NO_CHANNEL });
  });

  it('posts an approved proposal with its author, chosen once', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const member = await memberToken('mario');
    await PlayerModel.create({ tag: '#MMARIO', name: 'Mario', role: 'member', townHallLevel: 18, inClan: true });
    const proposed = await call(propose, { token: member, body: form({ layoutUrl: link(18), image: await png() }) });
    const id = proposed.body.result.id as string;
    await requestBasePostSync();
    expect(telegram.of('sendPhoto')).toEqual([]);
    expect(await postOf(id)).toBeNull();

    await call(approve, { token: admin, params: { id } });
    await requestBasePostSync();
    expect(telegram.of('sendPhoto')[0]!.params.caption).toBe('🏰 <b>Base TH18</b>\n\n👤 Proposta da <b>Mario</b>\n\n#TH18');

    // The player changes name: the post keeps the name it was published with.
    await PlayerModel.updateOne({ tag: '#MMARIO' }, { $set: { name: 'Mario the Great' } });
    await call(updateBase, { token: admin, method: 'PATCH', params: { id }, body: form({ description: 'Good' }) });
    await requestBasePostSync();
    expect(telegram.of('editMessageCaption')[0]!.params.caption).toBe('🏰 <b>Base TH18</b>\n\n📝 Good\n\n👤 Proposta da <b>Mario</b>\n\n#TH18');
  });

  it('tells the moderation where each proposal goes on Telegram, and how its post stands', async () => {
    mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18, { username: 'basi18' });
    const member = await memberToken('mario');
    const proposeAt = async (th: number, id: string) =>
      (await call(propose, { token: member, body: form({ layoutUrl: link(th, id), image: await png() }) })).body.result
        .id as string;
    const toTh18 = await proposeAt(18, 'AAAA0018');
    const toTh17 = await proposeAt(17, 'AAAA0017');
    const moderation = async (status: string) =>
      (await call(listProposals, { token: admin, path: `/api/v1/base-proposals?status=${status}` })).body.result.items as {
        id: string;
        telegram: unknown;
      }[];

    const channel18 = { title: 'Arsenale basi TH18', username: 'basi18', canPost: true };
    expect(Object.fromEntries((await moderation('PENDING')).map((p) => [p.id, p.telegram]))).toEqual({
      [toTh18]: { channel: channel18, post: null },
      [toTh17]: { channel: null, post: null },
    });

    await call(approve, { token: admin, params: { id: toTh18 } });
    await call(approve, { token: admin, params: { id: toTh17 } });
    await requestBasePostSync();
    expect(Object.fromEntries((await moderation('APPROVED')).map((p) => [p.id, p.telegram]))).toEqual({
      [toTh18]: { channel: channel18, post: { status: 'sent', error: null, retryAt: null } },
      [toTh17]: { channel: null, post: { status: 'noChannel', error: null, retryAt: null } },
    });

    // Approved but not handled by the sync yet: on its way.
    await TelegramBasePostModel.deleteOne({ baseId: toTh18 });
    expect((await moderation('APPROVED')).find((p) => p.id === toTh18)!.telegram).toEqual({
      channel: channel18,
      post: { status: 'pending', error: null, retryAt: null },
    });

    // Without a bot nothing goes to Telegram: no state at all.
    delete process.env.TELEGRAM_BOT_TOKEN;
    resetEnvCache();
    expect((await moderation('APPROVED')).map((p) => p.telegram)).toEqual([null, null]);
  });

  it('saves a failure, waits before trying again, and tries at once when an administrator asks', async () => {
    let down = true;
    const telegram = mockTelegramApi({
      sendPhoto: () => (down ? { error: 500, description: 'Internal Server Error' } : undefined),
    });
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const id = await create(admin);
    const failed = await postOf(id);
    expect(failed).toMatchObject({ status: BasePostStatus.FAILED, error: 'Internal Server Error', failures: 1 });
    expect(failed!.retryAt!.getTime()).toBeGreaterThan(Date.now());

    down = false;
    await requestBasePostSync();
    expect(telegram.of('sendPhoto')).toHaveLength(1);
    const status = await call(getStatus, { token: admin });
    expect(status.body.result.basePosts.failed).toMatchObject([{ baseId: id, townHallLevel: 18, error: 'Internal Server Error' }]);

    const res = await call(syncPosts, { token: admin, method: 'POST' });
    expect(res.status).toBe(200);
    await requestBasePostSync();
    expect(telegram.of('sendPhoto')).toHaveLength(2);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.SENT, failures: 0, error: null });
  });

  it('marks a channel the bot can no longer post in', async () => {
    mockTelegramApi({ sendPhoto: () => ({ error: 403, description: 'Forbidden: bot is not a member of the channel chat' }) });
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const id = await create(admin);
    expect(await postOf(id)).toMatchObject({ status: BasePostStatus.FAILED });
    expect(await TelegramChatModel.findOne({ chatId: TH18_CHANNEL }).lean()).toMatchObject({ canPost: false });
  });

  it('does nothing while Telegram is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    resetEnvCache();
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const id = await create(admin);
    expect(telegram.calls).toEqual([]);
    expect(await postOf(id)).toBeNull();
    const status = await call(getStatus, { token: admin });
    expect(status.body.result).toMatchObject({ configured: false, botUsername: null, updates: null });
    expect((await call(syncPosts, { token: admin, method: 'POST' })).status).toBe(409);
  });
});

describe('webhook', () => {
  const update = (body: unknown, secret = SECRET) =>
    call(webhook, { body, origin: null, headers: { 'x-telegram-bot-api-secret-token': secret } });

  it('is off without TELEGRAM_WEBHOOK_SECRET, and refuses a wrong secret', async () => {
    mockTelegramApi();
    expect((await update({ update_id: 1 })).status).toBe(404);
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    resetEnvCache();
    expect((await update({ update_id: 1 }, 'x'.repeat(SECRET.length))).status).toBe(401);
  });

  it('saves the channel the bot was made an administrator of', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    resetEnvCache();
    mockTelegramApi();
    const res = await update({
      update_id: 7,
      my_chat_member: {
        chat: { id: -1001900, type: 'channel', title: 'Arsenale basi TH19', username: 'basi19' },
        new_chat_member: { status: 'administrator', can_post_messages: true },
      },
    });
    expect(res.status).toBe(200);
    expect(await TelegramChatModel.findOne({ chatId: -1001900 }).lean()).toMatchObject({
      title: 'Arsenale basi TH19',
      username: 'basi19',
      botStatus: 'administrator',
      canPost: true,
      townHallLevel: null,
    });
  });

  it('reads from Telegram a channel seen through a post, and ignores private chats', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    resetEnvCache();
    const telegram = mockTelegramApi({
      getChat: () => ({ result: { id: TH18_CHANNEL, type: 'channel', title: 'Arsenale basi TH18' } }),
      getChatMember: () => ({ result: { status: 'administrator', can_post_messages: true } }),
    });
    await update({ update_id: 8, channel_post: { chat: { id: TH18_CHANNEL, type: 'channel', title: 'x' } } });
    expect(telegram.of('getChatMember')[0]!.params).toEqual({ chat_id: TH18_CHANNEL, user_id: 4242 });
    expect(await TelegramChatModel.findOne({ chatId: TH18_CHANNEL }).lean()).toMatchObject({ title: 'Arsenale basi TH18', canPost: true });

    await update({ update_id: 9, message: { chat: { id: 55, type: 'private' } } });
    expect(await TelegramChatModel.countDocuments()).toBe(1);
  });
});

describe('administration of the chats', () => {
  it('adds a channel by its @username', async () => {
    const telegram = mockTelegramApi({
      getChat: (params) =>
        params.chat_id === '@basi18'
          ? { result: { id: TH18_CHANNEL, type: 'channel', title: 'Arsenale basi TH18', username: 'basi18' } }
          : { error: 400, description: 'Bad Request: chat not found' },
      getChatMember: () => ({ result: { status: 'administrator', can_post_messages: true } }),
    });
    const admin = await adminToken();
    const res = await call(addChat, { token: admin, body: { chat: 'basi18' } });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ chatId: TH18_CHANNEL, username: 'basi18', canPost: true });
    expect(telegram.of('getChat')[0]!.params).toEqual({ chat_id: '@basi18' });

    expect((await call(addChat, { token: admin, body: { chat: '@missing' } })).status).toBe(404);
    expect((await call(addChat, { token: admin, body: { chat: 'not valid!' } })).status).toBe(400);
  });

  it('binds a town hall to one chat only, and forgets chats', async () => {
    mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    await channel(TH17_CHANNEL, null);
    const taken = await call(updateChat, { token: admin, method: 'PATCH', params: { chatId: String(TH17_CHANNEL) }, body: { townHallLevel: 18 } });
    expect(taken.status).toBe(409);
    expect(taken.body.messages[0]).toMatchObject({ key: 'ERROR.TELEGRAM_TOWN_HALL_TAKEN', params: { level: 18 } });
    expect((await call(updateChat, { token: admin, method: 'PATCH', params: { chatId: '-1' }, body: { townHallLevel: 18 } })).status).toBe(404);

    expect((await call(removeChat, { token: admin, method: 'DELETE', params: { chatId: String(TH18_CHANNEL) } })).status).toBe(200);
    expect((await call(removeChat, { token: admin, method: 'DELETE', params: { chatId: String(TH18_CHANNEL) } })).status).toBe(404);
    const status = await call(getStatus, { token: admin });
    expect(status.body.result).toMatchObject({ configured: true, botUsername: 'CrociataNeraTestBot', chats: [{ chatId: TH17_CHANNEL }] });
  });

  it('keeps a locked chat on its town hall and in the list until it is unlocked', async () => {
    mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    const patch = (body: Record<string, unknown>) =>
      call(updateChat, { token: admin, method: 'PATCH', params: { chatId: String(TH18_CHANNEL) }, body });

    const locked = await patch({ locked: true });
    expect(locked.status).toBe(200);
    expect(locked.body.result).toMatchObject({ townHallLevel: 18, locked: true });

    const moved = await patch({ townHallLevel: 17 });
    expect(moved.status).toBe(409);
    expect(moved.body.messages[0]).toMatchObject({ key: 'ERROR.TELEGRAM_CHAT_LOCKED', params: { name: 'Arsenale basi TH18' } });
    expect((await patch({ townHallLevel: null })).status).toBe(409);
    // The same town hall again is no change.
    expect((await patch({ townHallLevel: 18 })).status).toBe(200);
    const removed = await call(removeChat, { token: admin, method: 'DELETE', params: { chatId: String(TH18_CHANNEL) } });
    expect(removed.status).toBe(409);
    expect(removed.body.messages[0]).toMatchObject({ key: 'ERROR.TELEGRAM_CHAT_LOCKED' });
    expect(await TelegramChatModel.findOne({ chatId: TH18_CHANNEL }).lean()).toMatchObject({ townHallLevel: 18, locked: true });

    const unlocked = await patch({ locked: false, townHallLevel: 17 });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.result).toMatchObject({ townHallLevel: 17, locked: false });
    expect((await patch({})).status).toBe(400);
  });

  it('keeps the announcements chat, one only, out of the bases', async () => {
    const telegram = mockTelegramApi();
    const admin = await adminToken();
    await channel(TH18_CHANNEL, 18);
    await channel(TH17_CHANNEL, null, { title: 'Annunci' });
    const patch = (chatId: number, body: Record<string, unknown>) =>
      call(updateChat, { token: admin, method: 'PATCH', params: { chatId: String(chatId) }, body });

    const made = await patch(TH17_CHANNEL, { purpose: 'announcements' });
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({ purpose: 'announcements', townHallLevel: null });

    const bound = await patch(TH17_CHANNEL, { townHallLevel: 17 });
    expect(bound.status).toBe(409);
    expect(bound.body.messages[0]).toMatchObject({ key: 'ERROR.TELEGRAM_CHAT_NOT_FOR_BASES', params: { name: 'Annunci' } });
    // A chat of bases must give up its town hall first (or in the same request).
    expect((await patch(TH18_CHANNEL, { purpose: 'announcements' })).body.messages[0]).toMatchObject({
      key: 'ERROR.TELEGRAM_CHAT_NOT_FOR_BASES',
    });
    const second = await patch(TH18_CHANNEL, { purpose: 'announcements', townHallLevel: null });
    expect(second.status).toBe(409);
    expect(second.body.messages[0]).toMatchObject({ key: 'ERROR.TELEGRAM_ANNOUNCEMENTS_TAKEN' });

    // Even written straight in the database, a town hall on the announcements chat gets no bases.
    await TelegramChatModel.updateOne({ chatId: TH17_CHANNEL }, { $set: { townHallLevel: 17 } });
    await create(admin, 17);
    expect(telegram.of('sendPhoto')).toEqual([]);

    await TelegramChatModel.updateOne({ chatId: TH17_CHANNEL }, { $set: { townHallLevel: null } });
    const back = await patch(TH17_CHANNEL, { purpose: 'bases', townHallLevel: 17 });
    expect(back.status).toBe(200);
    await requestBasePostSync();
    expect(telegram.of('sendPhoto').map((c) => c.params.chat_id)).toEqual([String(TH17_CHANNEL)]);
  });

  it('is for administrators only', async () => {
    mockTelegramApi();
    const member = await memberToken();
    expect((await call(getStatus, { token: member })).status).toBe(403);
    expect((await call(syncPosts, { token: member, method: 'POST' })).status).toBe(403);
  });
});
