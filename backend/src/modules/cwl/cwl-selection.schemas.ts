import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';
import { playerTag } from '@/modules/auth/auth.schemas';
import { MONTH_REGEX } from '@/modules/wars/history.service';
import { LINEUP_SIZES } from './cwl-selection.rules';

/** Most reserves of a line-up picked by hand: every member of the three clans of the Crusade. */
const MAX_RESERVES = 150;

export const MAX_EXCLUSION_REASON_LENGTH = 200;

/** `PUT /cwl/selection/exclusions/{tag}`: why the player is excluded (optional), and for how long. */
export const excludePlayerSchema = z.object({
  reason: z
    .string({ error: MessageKey.EXCLUSION_REASON_IS_TOO_LONG })
    .trim()
    .max(MAX_EXCLUSION_REASON_LENGTH, { error: MessageKey.EXCLUSION_REASON_IS_TOO_LONG })
    .nullish()
    .transform((value) => value || null),
  untilRevoked: z.boolean().optional().default(false),
});

const season = z.string().regex(MONTH_REGEX, { error: MessageKey.PERIOD_IS_NOT_VALID });

/** `GET /cwl/selection?season=2026-12` (and its players): the open selection when left out. */
export const selectionQuerySchema = z.object({ season: season.optional() });

/** `POST /cwl/selection/{season}/close|reopen`. */
export const selectionPathSchema = z.object({ season });

const lineupTags = (max: number) =>
  z
    .array(z.string({ error: MessageKey.PLAYER_TAG_IS_NOT_VALID }).pipe(playerTag), { error: MessageKey.CWL_LINEUP_NOT_VALID })
    .max(max, { error: MessageKey.CWL_LINEUP_NOT_VALID });

/**
 * `POST /cwl/selection/{season}/close`: the line-up picked by hand (starters and reserves among the
 * eligible players, the others to the bench); left out or `null`, the ranking's.
 */
export const closeSelectionSchema = z.object({
  lineup: z
    .object(
      {
        starters: lineupTags(Math.max(...Object.keys(LINEUP_SIZES).map(Number))).describe('Tags of the starters: as many as the size of the selection (15 or 30).'),
        reserves: lineupTags(MAX_RESERVES).describe('Tags of the reserves, as many as wanted (none too).'),
      },
      { error: MessageKey.CWL_LINEUP_NOT_VALID },
    )
    .nullish()
    .transform((value) => value ?? null),
});

/** `PUT /cwl/selection/{season}/lineup-size`: starters of the line-up, 15 (3 reserves) or 30 (5 reserves) (`LINEUP_SIZES`). */
export const lineupSizeSchema = z.object({
  starters: z.union([z.literal(15), z.literal(30)], { error: MessageKey.CWL_LINEUP_SIZE_NOT_VALID }),
});
