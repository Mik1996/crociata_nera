/** Host of the Clash of Clans pictures (clan badges, leagues, labels), out of the service worker's reach. */
export const COC_ASSETS_HOST = 'api-assets.clashofclans.com';

/** Class of an image hidden because its picture did not arrive (`styles.scss`). */
export const MISSING_IMAGE_CLASS = 'cn-img-missing';

/**
 * Hides the Clash of Clans pictures that fail to load (offline: the service worker cannot keep
 * them, their server sends no CORS headers) instead of showing the browser's broken image. The
 * space is kept, so the layout does not move; the image shows up again if its source loads later
 * (a fallback picture set by the component, or the network coming back).
 *
 * One listener for the whole document, in the capture phase: `error` and `load` do not bubble.
 */
export function hideMissingCocImages(doc: Document): () => void {
  const onError = (event: Event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && isCocAsset(img.currentSrc || img.src)) {
      img.classList.add(MISSING_IMAGE_CLASS);
    }
  };
  const onLoad = (event: Event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement) img.classList.remove(MISSING_IMAGE_CLASS);
  };
  doc.addEventListener('error', onError, true);
  doc.addEventListener('load', onLoad, true);
  return () => {
    doc.removeEventListener('error', onError, true);
    doc.removeEventListener('load', onLoad, true);
  };
}

function isCocAsset(src: string): boolean {
  try {
    return new URL(src).hostname === COC_ASSETS_HOST;
  } catch {
    return false;
  }
}
