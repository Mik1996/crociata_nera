/** Images the backend accepts (it re-encodes them anyway). */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Longest side sent to the backend: it keeps at most 1400 px, a little more leaves it room. */
export const MAX_UPLOAD_SIDE = 2000;

/** Largest file the browser will try to open (a 4K PNG screenshot is about 15 MB). */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** Size that fits `width × height` inside a `max × max` square, never enlarged. */
export function fitInside(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Shrinks a screenshot in the browser before the upload: at most {@link MAX_UPLOAD_SIDE} px,
 * re-encoded as WebP (JPEG where the browser cannot write WebP). A 5 MB PNG becomes a few hundred
 * KB, so the upload is quick even on a phone. The original is kept when it is already smaller.
 * Rejects when the file is not an image the browser can read.
 */
export async function prepareImage(file: Blob, maxSide = MAX_UPLOAD_SIDE): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const size = fitInside(bitmap.width, bitmap.height, maxSide);
  const resized = size.width !== bitmap.width || size.height !== bitmap.height;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Canvas not available');
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', 0.85);
  // Browsers that cannot encode WebP fall back to PNG: JPEG is much smaller for screenshots.
  if (blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.88);
  const keepOriginal = !resized && file.size <= blob.size && ACCEPTED_IMAGE_TYPES.some((t) => t === file.type);
  return { blob: keepOriginal ? file : blob, ...size };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))), type, quality),
  );
}
