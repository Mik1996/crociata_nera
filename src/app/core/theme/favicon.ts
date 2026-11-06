/**
 * Points the page icons (`<link rel="icon">`) at a new image, e.g. the clan badge returned by
 * the API. The static icons in `public/` (generated from the same badge) stay as the first
 * paint and as fallback when the API is unreachable.
 */
export function setFavicon(document: Document, url: string): void {
  const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
  links.forEach((link, index) => {
    if (index === 0) {
      if (link.href === url) return;
      link.href = url;
      link.type = 'image/png';
      link.removeAttribute('sizes');
    } else {
      // A single icon: otherwise browsers may keep picking the static one by size.
      link.remove();
    }
  });
}
