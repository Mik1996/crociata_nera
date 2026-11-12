import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getImage } from '@/app/api/v1/base-images/[key]/[variant]/route';
import { DELETE as deleteBase, GET as getBase, PATCH as updateBase } from '@/app/api/v1/bases/[id]/route';
import { GET as listBases, POST as createBase } from '@/app/api/v1/bases/route';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { BaseImageModel } from '@/modules/bases/base-image.store';
import { DefenseBaseModel } from '@/modules/bases/defense-base.model';
import { parseLayoutLink } from '@/modules/bases/layout-link';
import { UserModel } from '@/modules/auth/user.model';
import { call, memberToken } from './helpers';

const link = (th: number, id = 'AAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd') =>
  `https://link.clashofclans.com/en?action=OpenLayout&id=TH${th}%3AHV%3A${id}`;

/** A PNG screenshot of the given size. */
function png(width = 2400, height = 1600): Promise<Buffer> {
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

async function adminToken() {
  const user = await UserModel.create({
    email: 'boss@x.io',
    username: 'boss',
    usernameKey: 'boss',
    passwordHash: 'x',
    roles: [UserRole.USER, UserRole.ADMIN],
  });
  return (await signAccessToken({ sub: user._id.toString(), roles: [UserRole.USER, UserRole.ADMIN] })).token;
}

async function create(token: string, th = 18, extra: Record<string, string | Buffer> = {}, id?: string) {
  return call(createBase, { token, body: form({ layoutUrl: link(th, id), image: await png(), ...extra }) });
}

/** Image route: answers with binary data, not a BaseResult. */
async function image(key: string, variant: string) {
  const response = await getImage(new Request(`http://localhost:3001/api/v1/base-images/${key}/${variant}`), {
    params: Promise.resolve({ key, variant }),
  });
  return { status: response.status, headers: response.headers, data: Buffer.from(await response.arrayBuffer()) };
}

afterEach(() => vi.restoreAllMocks());

describe('layout links', () => {
  it('reads the town hall level and the layout id of a home village base', () => {
    expect(parseLayoutLink(link(18))).toEqual({
      url: link(18),
      layoutId: 'TH18:HV:AAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd',
      townHallLevel: 18,
    });
    expect(parseLayoutLink(` https://link.clashofclans.com/IT?id=TH9%3AHV%3AAbc_12-xyz&action=OpenLayout `)).toEqual({
      url: 'https://link.clashofclans.com/it?action=OpenLayout&id=TH9%3AHV%3AAbc_12-xyz',
      layoutId: 'TH9:HV:Abc_12-xyz',
      townHallLevel: 9,
    });
  });

  it('accepts every layout type of the home village (village, war base…)', () => {
    const warBase = 'https://link.clashofclans.com/it?action=OpenLayout&id=TH18%3AWB%3AAAAAFAAAAALLzhLmlzF4S8AYmJtI0bdX';
    expect(parseLayoutLink(warBase)).toEqual({
      url: warBase,
      layoutId: 'TH18:WB:AAAAFAAAAALLzhLmlzF4S8AYmJtI0bdX',
      townHallLevel: 18,
    });
    // Language path with a trailing slash.
    expect(
      parseLayoutLink('https://link.clashofclans.com/en/?action=OpenLayout&id=TH17%3AWB%3AAAAALQAAAAKlk0CYkuJc1V-zUS8yaH6u'),
    ).toEqual({
      url: 'https://link.clashofclans.com/en?action=OpenLayout&id=TH17%3AWB%3AAAAALQAAAAKlk0CYkuJc1V-zUS8yaH6u',
      layoutId: 'TH17:WB:AAAALQAAAAKlk0CYkuJc1V-zUS8yaH6u',
      townHallLevel: 17,
    });
  });

  it('refuses other links', () => {
    for (const text of [
      'not a link',
      'http://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
      'https://evil.example/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
      'https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=%23ABC',
      'https://link.clashofclans.com/en?action=OpenLayout&id=BH10%3ABB%3AAAAAFQAAAALR',
      'https://link.clashofclans.com/en?action=OpenLayout&id=TH0%3AHV%3AAAAAFQAAAALR',
      'https://link.clashofclans.com/en/x?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
    ]) {
      expect(parseLayoutLink(text), text).toBeNull();
    }
  });
});

describe('defense bases', () => {
  it('can be read by members of the clans and changed by administrators only', async () => {
    const admin = await adminToken();
    const member = await memberToken();
    const outsider = await call(createBase, { body: form({}) });
    expect(outsider.status).toBe(401);
    expect((await call(listBases)).status).toBe(401);

    expect((await call(listBases, { token: member })).status).toBe(200);
    const denied = await create(member);
    expect(denied.status).toBe(403);
    expect(denied.body.messages).toEqual([{ key: 'ERROR.FORBIDDEN' }]);

    const created = await create(admin);
    expect(created.status).toBe(201);
    const id = created.body.result.id;
    expect((await call(getBase, { token: member, params: { id } })).status).toBe(200);
    expect((await call(updateBase, { token: member, params: { id }, method: 'PATCH', body: form({ description: 'x' }) })).status).toBe(403);
    expect((await call(deleteBase, { token: member, params: { id }, method: 'DELETE' })).status).toBe(403);
  });

  it('saves the base with its town hall level from the link and the image re-encoded as WebP', async () => {
    const res = await create(await adminToken(), 18, { description: '  Dragoni + Golem  ' });
    expect(res.status).toBe(201);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_CREATED' }]);
    const base = res.body.result;
    expect(base).toMatchObject({
      townHallLevel: 18,
      layoutUrl: link(18),
      description: 'Dragoni + Golem',
      image: { width: 1400, height: 933 },
    });
    expect(base.image.key).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const full = await image(base.image.key, 'full');
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('image/webp');
    expect(full.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await sharp(full.data).metadata()).toMatchObject({ format: 'webp', width: 1400, height: 933 });
    const thumb = await image(base.image.key, 'thumb');
    expect(await sharp(thumb.data).metadata()).toMatchObject({ format: 'webp', width: 640, height: 427 });
    expect(thumb.data.length).toBeLessThan(full.data.length);

    expect((await image(base.image.key, 'original')).status).toBe(404);
    expect((await image('A'.repeat(24), 'full')).status).toBe(404);
    expect((await image('../etc', 'full')).status).toBe(404);
  });

  it('never enlarges small images', async () => {
    const res = await call(createBase, {
      token: await adminToken(),
      body: form({ layoutUrl: link(12), image: await png(300, 200) }),
    });
    expect(res.body.result.image).toMatchObject({ width: 300, height: 200 });
  });

  it('reports every invalid field together', async () => {
    const admin = await adminToken();
    const empty = await call(createBase, { token: admin, body: form({ description: 'x'.repeat(1001) }) });
    expect(empty.status).toBe(400);
    expect(empty.body.messages).toEqual([
      { key: 'ERROR.LAYOUT_LINK_SHOULD_NOT_BE_EMPTY', field: 'layoutUrl' },
      { key: 'ERROR.DESCRIPTION_IS_TOO_LONG', field: 'description' },
      { key: 'ERROR.IMAGE_SHOULD_NOT_BE_EMPTY', field: 'image' },
    ]);

    const wrongLink = await call(createBase, {
      token: admin,
      body: form({ layoutUrl: 'https://example.com/base', image: await png() }),
    });
    expect(wrongLink.body.messages).toEqual([{ key: 'ERROR.LAYOUT_LINK_IS_NOT_VALID', field: 'layoutUrl' }]);

    const notJson = await call(createBase, { token: admin, body: { layoutUrl: link(18) } });
    expect(notJson.status).toBe(400);
    expect(notJson.body.messages).toEqual([{ key: 'ERROR.INVALID_FORM_DATA' }]);
    expect(await DefenseBaseModel.countDocuments()).toBe(0);
  });

  it('accepts only real JPEG, PNG or WebP images', async () => {
    const admin = await adminToken();
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .gif()
      .toBuffer();
    for (const fake of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('not an image'), gif]) {
      const res = await call(createBase, { token: admin, body: form({ layoutUrl: link(18), image: fake }) });
      expect(res.status).toBe(400);
      expect(res.body.messages).toEqual([{ key: 'ERROR.IMAGE_IS_NOT_VALID', field: 'image' }]);
    }
    const jpeg = await sharp(await png(800, 600)).jpeg().toBuffer();
    expect((await call(createBase, { token: admin, body: form({ layoutUrl: link(18), image: jpeg }) })).status).toBe(201);
    expect(await BaseImageModel.countDocuments()).toBe(2);
  });

  it('refuses images over 10 MB', async () => {
    const res = await call(createBase, {
      token: await adminToken(),
      body: form({ layoutUrl: link(18), image: Buffer.alloc(10 * 1024 * 1024 + 1) }),
    });
    expect(res.status).toBe(413);
    expect(res.body.messages).toEqual([{ key: 'ERROR.IMAGE_IS_TOO_LARGE', params: { max: 10 }, field: 'image' }]);
  });

  it('refuses the same layout twice and more bases than the limit', async () => {
    const admin = await adminToken();
    expect((await create(admin)).status).toBe(201);
    const twice = await create(admin);
    expect(twice.status).toBe(409);
    expect(twice.body.messages).toEqual([{ key: 'ERROR.BASE_ALREADY_EXISTS', field: 'layoutUrl' }]);

    vi.spyOn(DefenseBaseModel, 'estimatedDocumentCount').mockResolvedValue(400);
    const full = await create(admin, 17, {}, 'BBBBFQAAAALRVVKKOsCkPrNIeGUyK9Qd');
    expect(full.status).toBe(409);
    expect(full.body.messages).toEqual([{ key: 'ERROR.BASE_LIMIT_REACHED', params: { max: 400 } }]);
    expect(await BaseImageModel.countDocuments()).toBe(2);
  });

  it('lists the bases by town hall, highest first, filtered by level', async () => {
    const admin = await adminToken();
    await create(admin, 16, {}, 'AAAA16xx');
    await create(admin, 18, {}, 'AAAA18ax');
    await create(admin, 17, {}, 'AAAA17xx');
    await create(admin, 18, {}, 'AAAA18bx');

    const all = await call(listBases, { token: admin });
    expect(all.body.result.townHallLevels).toEqual([18, 17, 16]);
    expect(all.body.result.items.map((b: { townHallLevel: number }) => b.townHallLevel)).toEqual([18, 18, 17, 16]);
    // Most recently changed first within a level.
    expect(all.body.result.items[0].layoutUrl).toContain('AAAA18bx');

    const th17 = await call(listBases, { token: admin, path: '/api/v1/bases?th=17' });
    expect(th17.body.result.items).toHaveLength(1);
    expect(th17.body.result.townHallLevels).toEqual([18, 17, 16]);
    expect((await call(listBases, { token: admin, path: '/api/v1/bases?th=abc' })).status).toBe(400);
  });

  it('changes only the fields sent and replaces the image', async () => {
    const admin = await adminToken();
    const base = (await create(admin, 18, { description: 'Old' })).body.result;
    const params = { id: base.id };

    const described = await call(updateBase, { token: admin, params, method: 'PATCH', body: form({ description: 'New' }) });
    expect(described.status).toBe(200);
    expect(described.body.messages).toEqual([{ key: 'SUCCESS.BASE_UPDATED' }]);
    expect(described.body.result).toMatchObject({ description: 'New', townHallLevel: 18, image: base.image });

    const moved = await call(updateBase, {
      token: admin,
      params,
      method: 'PATCH',
      body: form({ layoutUrl: link(17, 'CCCC17xx'), description: '', image: await png(1000, 1000) }),
    });
    expect(moved.body.result).toMatchObject({ townHallLevel: 17, layoutUrl: link(17, 'CCCC17xx'), description: '' });
    expect(moved.body.result.image.key).not.toBe(base.image.key);
    expect(moved.body.result.image).toMatchObject({ width: 1000, height: 1000 });
    expect((await image(base.image.key, 'full')).status).toBe(404);
    expect((await image(moved.body.result.image.key, 'full')).status).toBe(200);
    expect(await BaseImageModel.countDocuments()).toBe(2);
  });

  it('keeps the old image when an update is refused', async () => {
    const admin = await adminToken();
    await create(admin, 16, {}, 'TAKEN16x');
    const base = (await create(admin, 18)).body.result;
    const res = await call(updateBase, {
      token: admin,
      params: { id: base.id },
      method: 'PATCH',
      body: form({ layoutUrl: link(16, 'TAKEN16x'), image: await png() }),
    });
    expect(res.status).toBe(409);
    expect((await image(base.image.key, 'full')).status).toBe(200);
    expect(await BaseImageModel.countDocuments()).toBe(4);
  });

  it('deletes the base with its images', async () => {
    const admin = await adminToken();
    const base = (await create(admin)).body.result;
    const res = await call(deleteBase, { token: admin, params: { id: base.id }, method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.BASE_DELETED' }]);
    expect(await BaseImageModel.countDocuments()).toBe(0);
    expect((await image(base.image.key, 'thumb')).status).toBe(404);

    for (const id of [base.id, 'not-an-id']) {
      const missing = await call(deleteBase, { token: admin, params: { id }, method: 'DELETE' });
      expect(missing.status).toBe(404);
      expect(missing.body.messages).toEqual([{ key: 'ERROR.BASE_NOT_FOUND' }]);
    }
  });
});
