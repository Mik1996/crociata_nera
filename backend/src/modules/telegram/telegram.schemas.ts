import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';

/** Path parameter `{chatId}`: the numeric id of a Telegram chat (channels are negative). */
export const chatIdParamsSchema = z.object({
  chatId: z
    .string()
    .regex(/^-?\d{1,20}$/, { error: MessageKey.INVALID_FIELD })
    .transform(Number),
});

/** `@username` of a public chat, or the numeric id of any chat the bot is in. */
export const addChatSchema = z.object({
  chat: z
    .string({ error: MessageKey.INVALID_FIELD })
    .trim()
    .regex(/^(@?[A-Za-z][A-Za-z0-9_]{3,31}|-?\d{1,20})$/, { error: MessageKey.INVALID_FIELD }),
});

/** What changes in a chat: at least one of the two. */
export const updateChatSchema = z
  .object({
    /** Town hall level whose bases go to the chat; `null` unbinds it. */
    townHallLevel: z.number({ error: MessageKey.INVALID_FIELD }).int().min(1).max(30).nullable().optional(),
    /** Locks the chat (its town hall cannot change, it cannot be removed) or unlocks it. */
    locked: z.boolean({ error: MessageKey.INVALID_FIELD }).optional(),
  })
  .refine((body) => body.townHallLevel !== undefined || body.locked !== undefined, { error: MessageKey.INVALID_FIELD });
