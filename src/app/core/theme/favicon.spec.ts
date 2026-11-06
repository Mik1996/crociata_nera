import { setFavicon } from './favicon';

describe('setFavicon', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="icon" href="favicon.ico" sizes="48x48"><link rel="icon" type="image/png" href="icons/favicon-32.png" sizes="32x32">',
    );
  });

  it('points the page icon at the clan badge and keeps a single icon link', () => {
    setFavicon(document, 'https://api-assets.clashofclans.com/badges/512/x.png');
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://api-assets.clashofclans.com/badges/512/x.png');
    expect(links[0].type).toBe('image/png');
    expect(links[0].hasAttribute('sizes')).toBe(false);
  });
});
