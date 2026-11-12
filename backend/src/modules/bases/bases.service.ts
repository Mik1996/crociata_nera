import { randomBytes } from 'node:crypto';
import { QueryFilter, Types } from 'mongoose';
import { ApiError, throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { ImageVariant, processBaseImage } from './base-image';
import { imageStore, StoredImage } from './base-image.store';
import { CreateBaseInput, encodeBaseCursor, ListBasesQuery, UpdateBaseInput } from './bases.schemas';
import { ClanCastleTroop, clanCastleCapacity, housingSpaceUsed } from './clan-castle';
import {
  DefenseBase,
  DefenseBaseDocument,
  DefenseBaseModel,
  MAX_DEFENSE_BASES,
  PublicDefenseBase,
  toPublicDefenseBase,
} from './defense-base.model';

export interface DefenseBasePage {
  /** Highest town hall first, then the most recently changed. */
  items: PublicDefenseBase[];
  /** Cursor of the next page; `null` on the last page (nothing left to ask for). */
  nextCursor: string | null;
  /** Town hall levels with at least one base (all of them, whatever the filter), highest first. */
  townHallLevels: number[];
}

/** Shape of the image keys: 24 URL-safe characters (18 random bytes). */
export const IMAGE_KEY_PATTERN = /^[A-Za-z0-9_-]{24}$/;

/**
 * A page of the arsenal, sorted by town hall, last change and id (all descending). Keyset
 * pagination: the next page starts after the sort key of the last base sent, so bases added or
 * removed meanwhile neither repeat nor shift other bases between pages. One extra base is read to
 * know whether another page follows, so the last page says so and no empty page is ever asked for.
 */
export async function listBases({ th, limit, cursor }: ListBasesQuery): Promise<DefenseBasePage> {
  const filter: QueryFilter<DefenseBase> = th ? { townHallLevel: th } : {};
  if (cursor) {
    const { townHallLevel, updatedAt, id } = cursor;
    filter.$or = [
      { townHallLevel: { $lt: townHallLevel } },
      { townHallLevel, updatedAt: { $lt: updatedAt } },
      { townHallLevel, updatedAt, _id: { $lt: id } },
    ];
  }
  const [bases, levels] = await Promise.all([
    DefenseBaseModel.find(filter)
      .sort({ townHallLevel: -1, updatedAt: -1, _id: -1 })
      .limit(limit + 1),
    DefenseBaseModel.distinct('townHallLevel'),
  ]);
  const page = bases.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toPublicDefenseBase),
    nextCursor:
      bases.length > limit && last
        ? encodeBaseCursor({ townHallLevel: last.townHallLevel, updatedAt: last.updatedAt, id: last._id })
        : null,
    townHallLevels: (levels as number[]).sort((a, b) => b - a),
  };
}

export async function getBase(id: string): Promise<PublicDefenseBase> {
  return toPublicDefenseBase(await findBase(id));
}

/**
 * Adds a base. The image is re-encoded and stored first; if saving the base then fails, the image
 * is removed again, so no orphan images are left behind.
 */
export async function createBase(actorId: string, input: CreateBaseInput): Promise<PublicDefenseBase> {
  if ((await DefenseBaseModel.estimatedDocumentCount()) >= MAX_DEFENSE_BASES) {
    throwException(409, [{ key: MessageKey.BASE_LIMIT_REACHED, params: { max: MAX_DEFENSE_BASES } }]);
  }
  await assertLayoutIsNew(input.layoutUrl.layoutId);
  assertFitsClanCastle(input.clanCastleTroops, input.layoutUrl.townHallLevel);

  const images = await processBaseImage(input.image);
  const imageKey = newImageKey();
  await imageStore.save(imageKey, images);
  try {
    const base = await DefenseBaseModel.create({
      townHallLevel: input.layoutUrl.townHallLevel,
      layoutId: input.layoutUrl.layoutId,
      layoutUrl: input.layoutUrl.url,
      description: input.description,
      clanCastleTroops: input.clanCastleTroops,
      imageKey,
      imageWidth: images.full.width,
      imageHeight: images.full.height,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return toPublicDefenseBase(base);
  } catch (error) {
    await imageStore.remove(imageKey);
    throw duplicateLayoutOr(error);
  }
}

/**
 * Changes a base: only the fields sent. A new link also changes the town hall level; a new image
 * replaces the old one, which is deleted once the base points to the new one.
 */
export async function updateBase(actorId: string, id: string, input: UpdateBaseInput): Promise<PublicDefenseBase> {
  const base = await findBase(id);
  if (input.layoutUrl) {
    if (input.layoutUrl.layoutId !== base.layoutId) await assertLayoutIsNew(input.layoutUrl.layoutId);
    base.set({
      townHallLevel: input.layoutUrl.townHallLevel,
      layoutId: input.layoutUrl.layoutId,
      layoutUrl: input.layoutUrl.url,
    });
  }
  if (input.description !== undefined) base.description = input.description;
  if (input.clanCastleTroops !== undefined) base.set('clanCastleTroops', input.clanCastleTroops);
  // A lower town hall (new link) may leave less room for the troops already chosen.
  if (input.layoutUrl || input.clanCastleTroops) assertFitsClanCastle(base.clanCastleTroops, base.townHallLevel);

  const oldImageKey = base.imageKey;
  let newKey: string | null = null;
  if (input.image) {
    const images = await processBaseImage(input.image);
    newKey = newImageKey();
    await imageStore.save(newKey, images);
    base.set({ imageKey: newKey, imageWidth: images.full.width, imageHeight: images.full.height });
  }
  base.set('updatedBy', actorId);

  try {
    await base.save();
  } catch (error) {
    if (newKey) await imageStore.remove(newKey);
    throw duplicateLayoutOr(error);
  }
  if (newKey) await imageStore.remove(oldImageKey);
  return toPublicDefenseBase(base);
}

export async function deleteBase(id: string): Promise<void> {
  const base = await findBase(id);
  await DefenseBaseModel.deleteOne({ _id: base._id });
  await imageStore.remove(base.imageKey);
}

/** An image of a base; `null` when the key or variant does not exist. */
export async function readBaseImage(key: string, variant: ImageVariant): Promise<StoredImage | null> {
  return IMAGE_KEY_PATTERN.test(key) ? imageStore.read(key, variant) : null;
}

async function findBase(id: string): Promise<DefenseBaseDocument> {
  const base = Types.ObjectId.isValid(id) ? await DefenseBaseModel.findById(id) : null;
  if (!base) throwException(404, MessageKey.BASE_NOT_FOUND);
  return base;
}

/** The reinforcements must fit in the clan castle of the base's town hall. */
function assertFitsClanCastle(troops: readonly ClanCastleTroop[], townHallLevel: number): void {
  const used = housingSpaceUsed(troops);
  const max = clanCastleCapacity(townHallLevel);
  if (used > max) {
    throwException(400, [
      { key: MessageKey.CLAN_CASTLE_OVER_CAPACITY, params: { used, max }, field: 'clanCastleTroops' },
    ]);
  }
}

async function assertLayoutIsNew(layoutId: string): Promise<void> {
  if (await DefenseBaseModel.exists({ layoutId })) {
    throwException(409, [{ key: MessageKey.BASE_ALREADY_EXISTS, field: 'layoutUrl' }]);
  }
}

/** The same base saved at the same time by another administrator (unique index on the layout). */
function duplicateLayoutOr(error: unknown): unknown {
  if ((error as { code?: number }).code !== 11000) return error;
  return new ApiError(409, [{ key: MessageKey.BASE_ALREADY_EXISTS, field: 'layoutUrl' }]);
}

function newImageKey(): string {
  return randomBytes(18).toString('base64url');
}
