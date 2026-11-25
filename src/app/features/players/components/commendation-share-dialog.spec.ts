import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AppConfig, APP_CONFIG } from '../../../core/config/app-config';
import { MedalSnapshots } from '../../../shared/medal-3d/medal-snapshots.service';
import { ShareCard } from '../../../shared/share-card/share-card';
import { ShareCardRenderer } from '../../../shared/share-card/share-card-renderer';
import { CommendationShareData, CommendationShareDialog } from './commendation-share-dialog';

const DATA: CommendationShareData = {
  type: 'champion',
  tier: 'gold',
  player: 'Arciere Nero 🏹',
  detail: 'ottobre 2026',
};

async function render() {
  const still = vi.fn(async () => 'blob:medal');
  const renderCard = vi.fn(async (card: ShareCard) => new Blob([card.format], { type: 'image/png' }));
  const snackBar = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: APP_CONFIG, useValue: { clanName: 'Crociata Nera' } as AppConfig },
      { provide: MedalSnapshots, useValue: { still } },
      { provide: ShareCardRenderer, useValue: { render: renderCard } },
      { provide: MatSnackBar, useValue: snackBar },
    ],
  });
  const fixture = TestBed.createComponent(CommendationShareDialog);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, still, renderCard, snackBar };
}

describe('CommendationShareDialog', () => {
  const { createObjectURL, revokeObjectURL } = URL;
  let urls = 0;
  beforeEach(() => {
    urls = 0;
    URL.createObjectURL = vi.fn(() => `blob:card-${++urls}`);
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    delete (navigator as unknown as Record<string, unknown>)['canShare'];
    delete (navigator as unknown as Record<string, unknown>)['share'];
    vi.restoreAllMocks();
  });

  it('draws the square card of the medal, with the 3D still and the translated texts', async () => {
    const { el, still, renderCard } = await render();

    expect(still).toHaveBeenCalledWith('commendations/champion-gold.svg', 'gold', 400);
    expect(renderCard).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'square',
        kicker: 'Encomio conquistato',
        title: 'Signore della Guerra',
        tier: { label: 'Oro', metal: 'gold' },
        medal3d: 'blob:medal',
        medalSvg: 'commendations/champion-gold.svg',
        player: 'Arciere Nero 🏹',
        detail: 'ottobre 2026',
        clan: 'Crociata Nera',
      }),
    );
    expect(el.querySelector<HTMLImageElement>('.preview__image')!.getAttribute('src')).toBe('blob:card-1');
  });

  it('shows the caption with medal, period, site and hashtags', async () => {
    const { el } = await render();

    const caption = el.querySelector('.caption')!.textContent!;
    expect(caption).toContain("Ho conquistato l'encomio «Signore della Guerra – Oro» con il clan Crociata Nera!");
    expect(caption).toContain('ottobre 2026');
    expect(caption).toContain('https://crociatanera.it');
    expect(caption).toContain('#CrociataNera #ClashOfClans');
  });

  it('draws the story card when that format is chosen', async () => {
    const { fixture, el, renderCard, still } = await render();

    el.querySelectorAll<HTMLButtonElement>('.format')[1]!.click();
    await fixture.whenStable();

    expect(still).toHaveBeenLastCalledWith('commendations/champion-gold.svg', 'gold', 702);
    expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'story' }));
    expect(el.querySelectorAll('.format')[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.preview__image')!.getAttribute('src')).toBe('blob:card-2');
  });

  it('copies the caption', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { el, snackBar } = await render();

    el.querySelector<HTMLButtonElement>('button.copy')!.click();
    await vi.waitFor(() => expect(snackBar.open).toHaveBeenCalled());

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#CrociataNera'));
    expect(snackBar.open).toHaveBeenCalledWith('Testo copiato', undefined, expect.anything());
  });

  it('hides "Share" where the device cannot share files', async () => {
    const { el } = await render();

    expect(el.querySelector('button.share')).toBeNull();
    expect(el.querySelector('button.download')).not.toBeNull();
  });

  it('shares the picture with its caption through the share sheet', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { el } = await render();

    el.querySelector<HTMLButtonElement>('button.share')!.click();
    await vi.waitFor(() => expect(share).toHaveBeenCalled());

    const [{ files, text }] = share.mock.calls[0] as unknown as [{ files: File[]; text: string }];
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('crociata-nera-champion-gold-square.png');
    expect(files[0]!.type).toBe('image/png');
    expect(text).toContain('Signore della Guerra');
  });
});
