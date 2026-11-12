import sharp from 'sharp';
import { ApiError, throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';

/** Largest image accepted in an upload (the frontend shrinks screenshots well below it). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Largest image accepted, in pixels (protects the server from decompression bombs). */
const MAX_IMAGE_PIXELS = 50_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export const IMAGE_VARIANTS = ['thumb', 'full'] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

/** Longest side of each variant: thumbnails for the grid, full size for the enlarged view. */
const VARIANT_SIZE: Record<ImageVariant, { side: number; quality: number }> = {
  thumb: { side: 640, quality: 70 },
  full: { side: 1400, quality: 78 },
};

export const IMAGE_CONTENT_TYPE = 'image/webp';

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
}

export type ProcessedImages = Record<ImageVariant, ProcessedImage>;

/**
 * Re-encodes an uploaded base screenshot as WebP in the sizes of {@link VARIANT_SIZE}. The upload
 * is never stored as is: re-encoding drops metadata (EXIF, location) and anything that is not
 * image data. JPEG, PNG and WebP are accepted, recognised by their content, not by their name.
 */
export async function processBaseImage(input: Buffer): Promise<ProcessedImages> {
  const source = () => sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' });
  try {
    const { format } = await source().metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) invalidImage();
    const entries = await Promise.all(
      IMAGE_VARIANTS.map(async (variant) => {
        const { side, quality } = VARIANT_SIZE[variant];
        const { data, info } = await source()
          .rotate() // applies the EXIF orientation of photos before it is dropped
          .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
          .webp({ quality, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        return [variant, { data, width: info.width, height: info.height }] as const;
      }),
    );
    return Object.fromEntries(entries) as ProcessedImages;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return invalidImage();
  }
}

function invalidImage(): never {
  return throwException(400, [{ key: MessageKey.IMAGE_IS_NOT_VALID, field: 'image' }]);
}
