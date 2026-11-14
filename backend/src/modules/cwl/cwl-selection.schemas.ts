import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';

export const MAX_EXCLUSION_REASON_LENGTH = 200;

/** `PUT /cwl/selection/exclusions/{tag}`: why the player is excluded (optional). */
export const excludePlayerSchema = z.object({
  reason: z
    .string({ error: MessageKey.EXCLUSION_REASON_IS_TOO_LONG })
    .trim()
    .max(MAX_EXCLUSION_REASON_LENGTH, { error: MessageKey.EXCLUSION_REASON_IS_TOO_LONG })
    .nullish()
    .transform((value) => value || null),
});
