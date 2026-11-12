import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { IMAGE_VARIANTS, ImageVariant } from '@/modules/bases/base-image';
import { readBaseImage } from '@/modules/bases/bases.service';

/**
 * `GET /api/v1/base-images/{key}/thumb|full`: screenshot of a defense base (WebP).
 *
 * No authentication: `<img>` cannot send the access token. The key is random (18 bytes) and only
 * appears in the protected list of bases, so the URL cannot be guessed. A new image gets a new
 * key, so the response is cached by the browser forever.
 */
export const GET = apiHandler<{ key: string; variant: string }>(
  { apiName: ApiName.BASE_IMAGES },
  async ({ params }) => {
    const variant = params.variant as ImageVariant;
    const image = IMAGE_VARIANTS.includes(variant) ? await readBaseImage(params.key, variant) : null;
    if (!image) throwException(404, MessageKey.NOT_FOUND);
    return new Response(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.contentType,
        'Content-Length': String(image.data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Only this site may embed the images.
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
);
