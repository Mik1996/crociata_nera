import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';
import { ANNOUNCEMENT_CAPTION_LIMIT, captionLength } from './announcement-caption';
import { ANNOUNCEMENT_LANGUAGES, DEFAULT_ANNOUNCEMENT_LANGUAGE } from './announcement-texts';

/** `?lang=`: language of the captions and pictures (the post goes out in it); Italian by default. */
export const languageQuerySchema = z.object({
  lang: z.enum(ANNOUNCEMENT_LANGUAGES, { error: MessageKey.INVALID_FIELD }).default(DEFAULT_ANNOUNCEMENT_LANGUAGE),
});

/** Path parameter `{page}` of a picture: 1 to 10 (Telegram groups at most 10 pictures). */
export const imageParamsSchema = z.object({
  id: z.string(),
  page: z
    .string()
    .regex(/^([1-9]|10)$/, { error: MessageKey.INVALID_FIELD })
    .transform(Number),
});

/** New caption of a draft (`**text**` is bold); `null` goes back to the generated one. */
export const updateAnnouncementSchema = z.object({
  caption: z
    .string({ error: MessageKey.INVALID_FIELD })
    .trim()
    .min(1, { error: MessageKey.INVALID_FIELD })
    .refine((caption) => captionLength(caption) <= ANNOUNCEMENT_CAPTION_LIMIT, { error: MessageKey.CAPTION_IS_TOO_LONG })
    .nullable(),
});
