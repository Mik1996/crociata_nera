import { z } from 'zod';

/** `GET /raids/seasons?limit=10`. */
export const listRaidSeasonsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(52).default(10) });
