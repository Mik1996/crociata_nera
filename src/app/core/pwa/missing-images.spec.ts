import { hideMissingCocImages, MISSING_IMAGE_CLASS } from './missing-images';

describe('hideMissingCocImages', () => {
  let stop: () => void;
  beforeEach(() => (stop = hideMissingCocImages(document)));
  afterEach(() => {
    stop();
    document.body.replaceChildren();
  });

  function image(src: string): HTMLImageElement {
    const img = document.createElement('img');
    img.src = src;
    document.body.append(img);
    return img;
  }

  it('hides a Clash of Clans picture that fails, shows it again once a source loads', () => {
    const img = image('https://api-assets.clashofclans.com/badges/200/x.png');
    img.dispatchEvent(new Event('error'));
    expect(img.classList).toContain(MISSING_IMAGE_CLASS);

    img.dispatchEvent(new Event('load'));
    expect(img.classList).not.toContain(MISSING_IMAGE_CLASS);
  });

  it('leaves the other images alone', () => {
    const local = image('/images/clan-crest-black.webp');
    local.dispatchEvent(new Event('error'));
    expect(local.classList).not.toContain(MISSING_IMAGE_CLASS);
  });

  it('stops listening when removed', () => {
    stop();
    const img = image('https://api-assets.clashofclans.com/badges/200/x.png');
    img.dispatchEvent(new Event('error'));
    expect(img.classList).not.toContain(MISSING_IMAGE_CLASS);
  });
});
