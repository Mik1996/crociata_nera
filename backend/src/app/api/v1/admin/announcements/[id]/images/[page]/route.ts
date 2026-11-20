import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { validate } from '@/lib/validation/parse';
import { imageParamsSchema } from '@/modules/announcements/announcements.schemas';
import { announcementImage } from '@/modules/announcements/announcements.service';

type Params = z.input<typeof imageParamsSchema>;

/**
 * `GET /api/v1/admin/announcements/{id}/images/{page}` (ADMIN only): picture `page` (from 1) of an
 * announcement, JPEG, as it goes (or went) to Telegram. Drawn at every request: a draft's figures change.
 */
export const GET = apiHandler<Params, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ params }) => {
    const { id, page } = validate(imageParamsSchema, params);
    const image = await announcementImage(id, page - 1);
    return new Response(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(image.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
);

export const OPTIONS = preflight;
