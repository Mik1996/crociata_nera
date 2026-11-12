import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError, throwException } from '@/lib/http/api-error';
import { MessageDescriptor } from '@/lib/http/base-result';
import { MessageKey } from '@/lib/http/message-key';
import { toMessages } from '@/lib/validation/parse';
import { MAX_IMAGE_BYTES } from './base-image';
import { MAX_CLAN_CASTLE_CAPACITY, mergeTroops, TROOP_NAMES } from './clan-castle';
import { MAX_DESCRIPTION_LENGTH } from './defense-base.model';
import { LayoutLink, MAX_TOWN_HALL_LEVEL, parseLayoutLink } from './layout-link';

/** Bases per page of `GET /bases` when `limit` is not given, and the most a page can hold. */
export const DEFAULT_BASES_PAGE_SIZE = 24;
export const MAX_BASES_PAGE_SIZE = 60;

/**
 * Position in the arsenal after which the next page starts: the sort key of the last base of the
 * previous page. Sent as an opaque text (`nextCursor`); see {@link encodeBaseCursor}.
 */
export interface BaseCursor {
  townHallLevel: number;
  updatedAt: Date;
  id: Types.ObjectId;
}

/** `<town hall>.<updatedAt ms>.<id>`, base64url: opaque for clients, stable across requests. */
export function encodeBaseCursor({ townHallLevel, updatedAt, id }: BaseCursor): string {
  return Buffer.from(`${townHallLevel}.${updatedAt.getTime()}.${id.toString()}`).toString('base64url');
}

export function decodeBaseCursor(text: string): BaseCursor | null {
  const match = /^(\d{1,2})\.(\d{1,15})\.([0-9a-f]{24})$/.exec(Buffer.from(text, 'base64url').toString());
  if (!match) return null;
  return { townHallLevel: Number(match[1]), updatedAt: new Date(Number(match[2])), id: new Types.ObjectId(match[3]) };
}

/** `GET /bases?th=18&limit=24&cursor=…`: a page of bases, optionally of one town hall level. */
export const listBasesQuerySchema = z.object({
  th: z.coerce.number().int().min(1).max(MAX_TOWN_HALL_LEVEL).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_BASES_PAGE_SIZE).default(DEFAULT_BASES_PAGE_SIZE),
  cursor: z
    .string()
    .max(100)
    .transform((text, ctx): BaseCursor => {
      const cursor = decodeBaseCursor(text);
      if (!cursor) {
        ctx.addIssue({ code: 'custom', message: MessageKey.INVALID_FIELD });
        return z.NEVER;
      }
      return cursor;
    })
    .optional(),
});
export type ListBasesQuery = z.output<typeof listBasesQuerySchema>;

/** In-game "copy base" link, read into its town hall level and layout id. */
const layoutLink = z
  .string({ error: MessageKey.LAYOUT_LINK_SHOULD_NOT_BE_EMPTY })
  .trim()
  .min(1, { error: MessageKey.LAYOUT_LINK_SHOULD_NOT_BE_EMPTY })
  .max(500, { error: MessageKey.LAYOUT_LINK_IS_NOT_VALID })
  .transform((text, ctx): LayoutLink => {
    const link = parseLayoutLink(text);
    if (!link) {
      ctx.addIssue({ code: 'custom', message: MessageKey.LAYOUT_LINK_IS_NOT_VALID });
      return z.NEVER;
    }
    return link;
  });

const description = z
  .string({ error: MessageKey.INVALID_FIELD })
  .trim()
  .max(MAX_DESCRIPTION_LENGTH, { error: MessageKey.DESCRIPTION_IS_TOO_LONG });

const invalidTroops = { error: MessageKey.CLAN_CASTLE_TROOPS_NOT_VALID };

/**
 * Clan castle reinforcements, sent as a JSON text field: `[{"name":"Golem","count":1}, …]`. The
 * troops must be known; the capacity of the castle is checked against the town hall by the service.
 */
const clanCastleTroops = z
  .string(invalidTroops)
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: 'custom', message: MessageKey.CLAN_CASTLE_TROOPS_NOT_VALID });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z.object({
          name: z.enum(TROOP_NAMES, invalidTroops),
          count: z.number(invalidTroops).int(invalidTroops).min(1, invalidTroops).max(MAX_CLAN_CASTLE_CAPACITY, invalidTroops),
        }),
        invalidTroops,
      )
      .max(TROOP_NAMES.length, invalidTroops),
  )
  .transform(mergeTroops);

export const createBaseSchema = z.object({
  layoutUrl: layoutLink,
  description: description.default(''),
  clanCastleTroops: clanCastleTroops.default([]),
});
/** Every field is optional: only the ones sent change (an empty description or `[]` clears it). */
export const updateBaseSchema = z.object({
  layoutUrl: layoutLink.optional(),
  description: description.optional(),
  clanCastleTroops: clanCastleTroops.optional(),
});

export type CreateBaseInput = z.output<typeof createBaseSchema> & { image: Buffer };
export type UpdateBaseInput = z.output<typeof updateBaseSchema> & { image: Buffer | null };

/** Room for the text fields and the multipart boundaries on top of the image. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

/**
 * Reads a `multipart/form-data` body with the fields `layoutUrl`, `description`,
 * `clanCastleTroops` (JSON) and `image` (a file). Field and image errors are reported together (400). Oversized uploads are refused from
 * `Content-Length` before the body is read (413).
 */
export async function parseBaseForm<S extends typeof createBaseSchema | typeof updateBaseSchema>(
  request: Request,
  schema: S,
  { imageRequired }: { imageRequired: boolean },
): Promise<z.output<S> & { image: Buffer | null }> {
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_IMAGE_BYTES + FORM_OVERHEAD_BYTES) imageTooLarge();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, [{ key: MessageKey.INVALID_FORM_DATA }]);
  }

  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : undefined;
  };
  const parsed = schema.safeParse({
    layoutUrl: text('layoutUrl'),
    description: text('description'),
    clanCastleTroops: text('clanCastleTroops'),
  });
  const messages: MessageDescriptor[] = parsed.success ? [] : toMessages(parsed.error);

  const file = form.get('image');
  const hasImage = typeof file === 'object' && file !== null && file.size > 0;
  if (hasImage && file.size > MAX_IMAGE_BYTES) imageTooLarge();
  if (!hasImage && imageRequired) messages.push({ key: MessageKey.IMAGE_SHOULD_NOT_BE_EMPTY, field: 'image' });

  if (messages.length || !parsed.success) throw new ApiError(400, messages);
  return { ...parsed.data, image: hasImage ? Buffer.from(await file.arrayBuffer()) : null } as z.output<S> & {
    image: Buffer | null;
  };
}

function imageTooLarge(): never {
  return throwException(413, [
    { key: MessageKey.IMAGE_IS_TOO_LARGE, params: { max: MAX_IMAGE_BYTES / 1024 / 1024 }, field: 'image' },
  ]);
}
