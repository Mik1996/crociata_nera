import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as approve } from '@/app/api/v1/base-proposals/[id]/approve/route';
import { POST as reject } from '@/app/api/v1/base-proposals/[id]/reject/route';
import { DELETE as withdraw, PATCH as updateProposal } from '@/app/api/v1/base-proposals/[id]/route';
import { GET as listMine } from '@/app/api/v1/base-proposals/mine/route';
import { GET as pendingCount } from '@/app/api/v1/base-proposals/pending-count/route';
import { GET as listProposals, POST as propose } from '@/app/api/v1/base-proposals/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { DELETE as deleteBase, GET as getBase, PATCH as updateBase } from '@/app/api/v1/bases/[id]/route';
import { GET as listBases, POST as createBase } from '@/app/api/v1/bases/route';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { UserModel } from '@/modules/auth/user.model';
import { BaseImageModel } from '@/modules/bases/base-image.store';
import { MAX_OPEN_PROPOSALS } from '@/modules/bases/base-proposals.service';
import { BaseStatus, DefenseBaseModel, migrateBaseStatus } from '@/modules/bases/defense-base.model';
import { call, memberToken } from './helpers';

const link = (th: number, id = 'AAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd') =>
  `https://link.clashofclans.com/en?action=OpenLayout&id=TH${th}%3AHV%3A${id}`;

function png(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } } })
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

async function adminToken(username = 'boss') {
  const user = await UserModel.create({
    email: `${username}@x.io`,
    username,
    usernameKey: username,
    passwordHash: 'x',
    roles: [UserRole.USER, UserRole.ADMIN],
  });
  return (await signAccessToken({ sub: user._id.toString(), roles: [UserRole.USER, UserRole.ADMIN] })).token;
}

/** A signed-in user without a linked account in the clans of the Crusade. */
async function outsiderToken() {
  const { body } = await call(signUp, {
    body: { email: 'out@x.io', username: 'outsider', password: 'secret123', repeatPassword: 'secret123' },
  });
  return body.result.accessToken as string;
}

async function proposeBase(token: string, th = 18, id?: string, extra: Record<string, string | Buffer> = {}) {
  return call(propose, { token, body: form({ layoutUrl: link(th, id), image: await png(), ...extra }) });
}

const arsenalIds = async (token: string) =>
  ((await call(listBases, { token })).body.result.items as { id: string }[]).map((b) => b.id);

const moderation = (token: string, status: string) =>
  call(listProposals, { token, path: `/api/v1/base-proposals?status=${status}` });

afterEach(() => vi.restoreAllMocks());

describe('base proposals', () => {
  it('can be sent by members of the clans only, and wait out of the arsenal', async () => {
    const member = await memberToken('alice');
    expect((await call(propose, { body: form({}) })).status).toBe(401);
    const outsider = await proposeBase(await outsiderToken());
    expect(outsider.status).toBe(403);
    expect(outsider.body.messages).toEqual([{ key: 'ERROR.CLAN_ACCESS_REQUIRED' }]);

    const res = await proposeBase(member, 17, 'PROPOSED1', { description: 'Anti dragoni' });
    expect(res.status).toBe(201);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_PROPOSED' }]);
    expect(res.body.result).toMatchObject({
      status: 'PENDING',
      townHallLevel: 17,
      description: 'Anti dragoni',
      author: { username: 'alice' },
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
    });
    const id = res.body.result.id;

    // Not in the arsenal, not even by id.
    expect(await arsenalIds(member)).toEqual([]);
    expect((await call(listBases, { token: member })).body.result.townHallLevels).toEqual([]);
    const byId = await call(getBase, { token: member, params: { id } });
    expect(byId.status).toBe(404);

    // Among the author's proposals only.
    const mine = await call(listMine, { token: member });
    expect(mine.body.result.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await call(listMine, { token: await memberToken('bob') })).body.result).toEqual([]);
  });

  it('are refused with invalid or too large images, like the bases of the administrators', async () => {
    const member = await memberToken();
    for (const fake of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('GIF89a not an image')]) {
      const res = await call(propose, { token: member, body: form({ layoutUrl: link(18), image: fake }) });
      expect(res.status).toBe(400);
      expect(res.body.messages).toEqual([{ key: 'ERROR.IMAGE_IS_NOT_VALID', field: 'image' }]);
    }
    const huge = await call(propose, {
      token: member,
      body: form({ layoutUrl: link(18), image: Buffer.alloc(10 * 1024 * 1024 + 1) }),
    });
    expect(huge.status).toBe(413);
    expect(huge.body.messages).toEqual([{ key: 'ERROR.IMAGE_IS_TOO_LARGE', params: { max: 10 }, field: 'image' }]);
    const missing = await call(propose, { token: member, body: form({ layoutUrl: link(18) }) });
    expect(missing.body.messages).toEqual([{ key: 'ERROR.IMAGE_SHOULD_NOT_BE_EMPTY', field: 'image' }]);
    expect(await DefenseBaseModel.countDocuments()).toBe(0);
    expect(await BaseImageModel.countDocuments()).toBe(0);
  });

  it('cannot repeat a layout already in the arsenal or proposed', async () => {
    const admin = await adminToken();
    const member = await memberToken();
    await call(createBase, { token: admin, body: form({ layoutUrl: link(18, 'TAKEN18x'), image: await png() }) });
    expect((await proposeBase(member, 18, 'TAKEN18x')).status).toBe(409);
    expect((await proposeBase(member, 17, 'PROPOSEDx')).status).toBe(201);
    const twice = await proposeBase(await memberToken('bob'), 17, 'PROPOSEDx');
    expect(twice.status).toBe(409);
    expect(twice.body.messages).toEqual([{ key: 'ERROR.BASE_ALREADY_EXISTS', field: 'layoutUrl' }]);
  });

  it(`are at most ${MAX_OPEN_PROPOSALS} open per member`, async () => {
    const member = await memberToken();
    for (let i = 0; i < MAX_OPEN_PROPOSALS; i++) {
      expect((await proposeBase(member, 15, `LIMIT${String(i).padStart(4, '0')}`)).status).toBe(201);
    }
    const over = await proposeBase(member, 15, 'LIMITover');
    expect(over.status).toBe(409);
    expect(over.body.messages).toEqual([
      { key: 'ERROR.BASE_PROPOSAL_LIMIT_REACHED', params: { max: MAX_OPEN_PROPOSALS } },
    ]);
  });
});

describe('moderation', () => {
  it('lists the waiting proposals to administrators, oldest first, without their own bases', async () => {
    const admin = await adminToken();
    const member = await memberToken('alice');
    await call(createBase, { token: admin, body: form({ layoutUrl: link(18, 'ADMINxxx'), image: await png() }) });
    const first = (await proposeBase(member, 16, 'FIRSTxxx')).body.result;
    const second = (await proposeBase(member, 17, 'SECONDxx')).body.result;

    const pending = await moderation(admin, 'PENDING');
    expect(pending.status).toBe(200);
    expect(pending.body.result.items.map((p: { id: string }) => p.id)).toEqual([first.id, second.id]);
    expect(pending.body.result.items[0].author).toEqual({ id: expect.any(String), username: 'alice' });
    expect(pending.body.result.counts).toEqual({ PENDING: 2, APPROVED: 0, REJECTED: 0 });
    // PENDING is the default; the state must be a known one.
    expect((await call(listProposals, { token: admin })).body.result.items).toHaveLength(2);
    expect((await moderation(admin, 'DRAFT')).status).toBe(400);
    expect((await moderation(admin, 'APPROVED')).body.result.items).toEqual([]);
  });

  it('approves a proposal: it reaches the arsenal at once, with who approved it and when', async () => {
    const admin = await adminToken('boss');
    const member = await memberToken('alice');
    const { id } = (await proposeBase(member, 17, 'APPROVEx')).body.result;

    const res = await call(approve, { token: admin, params: { id } });
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_APPROVED' }]);
    expect(res.body.result).toMatchObject({
      status: 'APPROVED',
      author: { username: 'alice' },
      reviewedBy: { username: 'boss' },
      reviewedAt: expect.any(String),
    });

    expect(await arsenalIds(member)).toEqual([id]);
    expect((await call(getBase, { token: member, params: { id } })).status).toBe(200);
    // No longer among the author's proposals, but in the history of the moderation.
    expect((await call(listMine, { token: member })).body.result).toEqual([]);
    const approved = await moderation(admin, 'APPROVED');
    expect(approved.body.result.items.map((p: { id: string }) => p.id)).toEqual([id]);
    expect(approved.body.result.counts).toEqual({ PENDING: 0, APPROVED: 1, REJECTED: 0 });

    // Only once.
    const again = await call(approve, { token: admin, params: { id } });
    expect(again.status).toBe(409);
    expect(again.body.messages).toEqual([{ key: 'ERROR.BASE_PROPOSAL_NOT_PENDING' }]);
    expect((await call(reject, { token: admin, params: { id }, body: { reason: 'x' } })).status).toBe(409);
    for (const missing of ['000000000000000000000000', 'nope']) {
      expect((await call(approve, { token: admin, params: { id: missing } })).status).toBe(404);
    }
  });

  it('rejects a proposal with a reason, shown to its author; it stays out of the arsenal', async () => {
    const admin = await adminToken('boss');
    const member = await memberToken('alice');
    const { id } = (await proposeBase(member, 17, 'REJECTxx')).body.result;

    for (const body of [{}, { reason: '   ' }]) {
      const empty = await call(reject, { token: admin, params: { id }, body });
      expect(empty.status).toBe(400);
      expect(empty.body.messages).toEqual([{ key: 'ERROR.REJECTION_REASON_SHOULD_NOT_BE_EMPTY', field: 'reason' }]);
    }
    const long = await call(reject, { token: admin, params: { id }, body: { reason: 'x'.repeat(501) } });
    expect(long.body.messages).toEqual([{ key: 'ERROR.REJECTION_REASON_IS_TOO_LONG', field: 'reason' }]);

    const res = await call(reject, { token: admin, params: { id }, body: { reason: '  Screenshot tagliato  ' } });
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_REJECTED' }]);
    expect(res.body.result).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Screenshot tagliato',
      reviewedBy: { username: 'boss' },
      reviewedAt: expect.any(String),
    });

    expect(await arsenalIds(member)).toEqual([]);
    const mine = await call(listMine, { token: member });
    expect(mine.body.result).toEqual([
      expect.objectContaining({ id, status: 'REJECTED', rejectionReason: 'Screenshot tagliato' }),
    ]);
    expect((await moderation(admin, 'REJECTED')).body.result.items).toHaveLength(1);
  });

  it('counts the waiting proposals for the badge of the administrators', async () => {
    const admin = await adminToken();
    const member = await memberToken('alice');
    await call(createBase, { token: admin, body: form({ layoutUrl: link(18, 'ADMINxxx'), image: await png() }) });
    expect((await call(pendingCount, { token: admin })).body.result).toEqual({ pending: 0 });
    const { id } = (await proposeBase(member, 16, 'FIRSTxxx')).body.result;
    await proposeBase(member, 17, 'SECONDxx');
    expect((await call(pendingCount, { token: admin })).body.result).toEqual({ pending: 2 });
    await call(approve, { token: admin, params: { id } });
    expect((await call(pendingCount, { token: admin })).body.result).toEqual({ pending: 1 });
    const denied = await call(pendingCount, { token: member });
    expect(denied.status).toBe(403);
    expect(denied.body.messages).toEqual([{ key: 'ERROR.FORBIDDEN' }]);
  });

  it('is for administrators only, also when the API is called directly', async () => {
    const member = await memberToken('alice');
    const { id } = (await proposeBase(member)).body.result;
    for (const res of [
      await call(approve, { token: member, params: { id } }),
      await call(reject, { token: member, params: { id }, body: { reason: 'no' } }),
      await moderation(member, 'PENDING'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.messages).toEqual([{ key: 'ERROR.FORBIDDEN' }]);
    }
    expect((await call(approve, { params: { id } })).status).toBe(401);
    // Nor through the routes of the arsenal.
    expect((await call(updateBase, { token: member, params: { id }, method: 'PATCH', body: form({}) })).status).toBe(
      403,
    );
    expect((await DefenseBaseModel.findById(id))!.status).toBe(BaseStatus.PENDING);
    expect(await arsenalIds(member)).toEqual([]);
  });
});

describe('own proposals', () => {
  it('a rejected proposal is corrected and sent again for review', async () => {
    const admin = await adminToken();
    const member = await memberToken('alice');
    const proposal = (await proposeBase(member, 17, 'FIXMExxx', { description: 'Old' })).body.result;
    await call(reject, { token: admin, params: { id: proposal.id }, body: { reason: 'Manca il castello' } });

    const res = await call(updateProposal, {
      token: member,
      params: { id: proposal.id },
      method: 'PATCH',
      body: form({ description: 'New', clanCastleTroops: JSON.stringify([{ name: 'Golem', count: 1 }]) }),
    });
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_PROPOSAL_RESUBMITTED' }]);
    expect(res.body.result).toMatchObject({
      status: 'PENDING',
      description: 'New',
      clanCastleTroops: [{ name: 'Golem', count: 1 }],
      image: proposal.image,
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
    });
    expect(Date.parse(res.body.result.submittedAt)).toBeGreaterThanOrEqual(Date.parse(proposal.submittedAt));
    expect((await moderation(admin, 'PENDING')).body.result.items).toHaveLength(1);

    // A waiting proposal can be changed too, and stays waiting.
    const waiting = await call(updateProposal, {
      token: member,
      params: { id: proposal.id },
      method: 'PATCH',
      body: form({ image: await png(600, 600) }),
    });
    expect(waiting.body.messages).toEqual([{ key: 'SUCCESS.BASE_PROPOSAL_UPDATED' }]);
    expect(waiting.body.result.image.key).not.toBe(proposal.image.key);
    expect(await BaseImageModel.countDocuments()).toBe(2);
  });

  it('cannot be read, changed or withdrawn by other users, nor changed once approved', async () => {
    const admin = await adminToken();
    const alice = await memberToken('alice');
    const bob = await memberToken('bob');
    const { id } = (await proposeBase(alice, 17, 'ALICExxx', { description: 'Mine' })).body.result;

    const patch = await call(updateProposal, {
      token: bob,
      params: { id },
      method: 'PATCH',
      body: form({ description: 'Hacked' }),
    });
    expect(patch.status).toBe(404);
    expect(patch.body.messages).toEqual([{ key: 'ERROR.BASE_NOT_FOUND' }]);
    expect((await call(withdraw, { token: bob, params: { id }, method: 'DELETE' })).status).toBe(404);
    expect((await call(listMine, { token: bob })).body.result).toEqual([]);
    expect((await DefenseBaseModel.findById(id))!.description).toBe('Mine');

    // Administrators' bases are nobody's proposals.
    const adminBase = (
      await call(createBase, { token: admin, body: form({ layoutUrl: link(18), image: await png() }) })
    ).body.result;
    expect((await call(withdraw, { token: alice, params: { id: adminBase.id }, method: 'DELETE' })).status).toBe(404);

    await call(approve, { token: admin, params: { id } });
    const approved = await call(updateProposal, {
      token: alice,
      params: { id },
      method: 'PATCH',
      body: form({ description: 'x' }),
    });
    expect(approved.status).toBe(409);
    expect(approved.body.messages).toEqual([{ key: 'ERROR.BASE_PROPOSAL_NOT_EDITABLE' }]);
    expect((await call(withdraw, { token: alice, params: { id }, method: 'DELETE' })).status).toBe(409);
    expect(await arsenalIds(alice)).toHaveLength(2);
  });

  it('a change racing an approval is not saved: approved bases never change without review', async () => {
    const admin = await adminToken();
    const member = await memberToken();
    const { id } = (await proposeBase(member, 17, 'RACExxxx', { description: 'Reviewed' })).body.result;
    // The author's request reads the proposal while it is waiting...
    const stale = await DefenseBaseModel.findById(id);
    const reviewedImage = stale!.imageKey;
    // ...an administrator approves it meanwhile...
    await call(approve, { token: admin, params: { id } });
    vi.spyOn(DefenseBaseModel, 'findOne').mockResolvedValueOnce(stale);
    // ...and the change arrives afterwards.
    const res = await call(updateProposal, {
      token: member,
      params: { id },
      method: 'PATCH',
      body: form({ description: 'Sneaked in', image: await png(500, 500) }),
    });
    expect(res.status).toBe(409);
    expect(res.body.messages).toEqual([{ key: 'ERROR.BASE_PROPOSAL_NOT_EDITABLE' }]);
    vi.restoreAllMocks();
    const saved = await DefenseBaseModel.findById(id);
    expect(saved).toMatchObject({ status: BaseStatus.APPROVED, description: 'Reviewed', imageKey: reviewedImage });
    expect(await BaseImageModel.countDocuments()).toBe(2);
  });

  it('a proposal not approved yet can be withdrawn, with its image', async () => {
    const admin = await adminToken();
    const member = await memberToken();
    const pending = (await proposeBase(member, 17, 'WITHDRAW')).body.result;
    const rejected = (await proposeBase(member, 16, 'REJECTED')).body.result;
    await call(reject, { token: admin, params: { id: rejected.id }, body: { reason: 'No' } });

    for (const { id } of [pending, rejected]) {
      const res = await call(withdraw, { token: member, params: { id }, method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_PROPOSAL_WITHDRAWN' }]);
    }
    expect(await DefenseBaseModel.countDocuments()).toBe(0);
    expect(await BaseImageModel.countDocuments()).toBe(0);
  });

  it('administrators can still change or delete any proposal through the arsenal routes', async () => {
    const admin = await adminToken();
    const member = await memberToken();
    const { id } = (await proposeBase(member)).body.result;
    const changed = await call(updateBase, {
      token: admin,
      params: { id },
      method: 'PATCH',
      body: form({ description: 'Fixed' }),
    });
    expect(changed.status).toBe(200);
    expect((await DefenseBaseModel.findById(id))!.status).toBe(BaseStatus.PENDING);
    expect((await call(deleteBase, { token: admin, params: { id }, method: 'DELETE' })).status).toBe(200);
  });
});

describe('bases saved before moderation', () => {
  it('stay in the arsenal, and are marked approved by the migration without moving', async () => {
    const admin = await adminToken();
    const created = (await call(createBase, { token: admin, body: form({ layoutUrl: link(18), image: await png() }) }))
      .body.result;
    expect(created).not.toHaveProperty('status');
    // As saved before this change: no moderation fields at all.
    await DefenseBaseModel.collection.updateOne(
      {},
      { $unset: { status: '', submittedAt: '', reviewedBy: '', reviewedAt: '', rejectionReason: '' } },
    );
    const before = await DefenseBaseModel.collection.findOne({});
    expect(before).not.toHaveProperty('status');

    const member = await memberToken();
    expect(await arsenalIds(member)).toEqual([created.id]);
    expect((await call(getBase, { token: member, params: { id: created.id } })).status).toBe(200);

    await migrateBaseStatus();
    await migrateBaseStatus(); // idempotent
    const after = await DefenseBaseModel.collection.findOne({});
    expect(after).toMatchObject({ status: 'APPROVED', updatedAt: before!.updatedAt, imageKey: before!.imageKey });
    expect(await arsenalIds(member)).toEqual([created.id]);
    // Not a proposal: absent from the moderation.
    expect((await moderation(admin, 'APPROVED')).body.result.items).toEqual([]);
  });

  it('administrators still publish their bases at once', async () => {
    const admin = await adminToken();
    const res = await call(createBase, { token: admin, body: form({ layoutUrl: link(18), image: await png() }) });
    expect(res.status).toBe(201);
    expect(await arsenalIds(admin)).toEqual([res.body.result.id]);
    expect((await DefenseBaseModel.findById(res.body.result.id))!).toMatchObject({
      status: 'APPROVED',
      submittedAt: null,
    });
  });
});
