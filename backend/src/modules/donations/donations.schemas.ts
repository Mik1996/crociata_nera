import { z } from 'zod';

/** `GET /donations/seasons?limit=12`. */
export const listDonationSeasonsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(36).default(12) });
