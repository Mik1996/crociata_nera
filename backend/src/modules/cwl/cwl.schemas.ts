import { z } from 'zod';

/** `GET /cwl/seasons?limit=12`. */
export const listCwlSeasonsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(36).default(12) });
