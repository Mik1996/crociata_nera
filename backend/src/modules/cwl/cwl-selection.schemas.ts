import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';
import { MONTH_REGEX } from '@/modules/wars/history.service';

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
