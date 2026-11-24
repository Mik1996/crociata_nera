import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { DefenseBase } from '../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../testing/fixtures';
import { BaseImageDialog, BaseImageDialogData } from './base-image-dialog';

const base = (id: string, townHallLevel: number): DefenseBase => ({
  id,
  townHallLevel,
  layoutUrl: `https://link.clashofclans.com/en?action=OpenLayout&id=TH${townHallLevel}%3AHV%3A${id}`,
  description: `Base ${id}`,
  clanCastleTroops: [],
  image: { key: id, width: 1400, height: 700 },
  createdAt: '2026-11-12T10:00:00Z',
  updatedAt: '2026-11-12T10:00:00Z',
});

const dialog = () => document.querySelector('mat-dialog-container') as HTMLElement;
const image = () =>
  dialog().querySelector<HTMLImageElement>('.image:not(.image--previous, .image--next)')!;
const previousButton = () => dialog().querySelector<HTMLButtonElement>('.nav--previous');
const nextButton = () => dialog().querySelector<HTMLButtonElement>('.nav--next');

function pointer(type: string, clientX: number, clientY = 100): Event {
  return Object.assign(new Event(type, { bubbles: true }), {
    pointerId: 1,
    isPrimary: true,
    clientX,
    clientY,
  });
}

describe('BaseImageDialog', () => {
  let bases: ReturnType<typeof signal<DefenseBase[]>>;
  let loadMore: ReturnType<typeof vi.fn<() => void>>;

  async function open(index: number) {
    TestBed.configureTestingModule({
      providers: [
        provideCocApiTest({ useMockApi: false }),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    loadMore = vi.fn<() => void>();
    bases = signal([base('a', 18), base('b', 18), base('c', 17)]);
    const data: BaseImageDialogData = {
      bases,
      index,
      imageUrl: (b) => `/full/${b.id}`,
      loadMore,
    };
    TestBed.inject(MatDialog).open(BaseImageDialog, { data });
    await settle();
  }

  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('goes to the previous and next base with the arrows, hiding them at the ends', async () => {
    await open(0);
    expect(image().getAttribute('src')).toBe('/full/a');
    expect(previousButton()).toBeNull();

    nextButton()!.click();
    await settle();
    expect(image().getAttribute('src')).toBe('/full/b');
    expect(previousButton()).not.toBeNull();

    nextButton()!.click();
    await settle();
    expect(image().getAttribute('src')).toBe('/full/c');
    expect(nextButton()).toBeNull();
    expect(dialog().querySelector('.description')!.textContent).toBe('Base c');

    previousButton()!.click();
    await settle();
    expect(image().getAttribute('src')).toBe('/full/b');
  });

  it('keeps the details box, with a note when a base has neither troops nor description', async () => {
    await open(0);
    expect(dialog().querySelector('.description')!.textContent).toBe('Base a');
    expect(dialog().querySelector('.empty')).toBeNull();

    bases.update((list) => list.map((b) => (b.id === 'b' ? { ...b, description: '' } : b)));
    nextButton()!.click();
    await settle();
    expect(dialog().querySelector('.details')).not.toBeNull();
    expect(dialog().querySelector('.description')).toBeNull();
    expect(dialog().querySelector('.empty')!.textContent).toContain('Nessuna nota');
  });

  it('follows the arrow keys', async () => {
    await open(1);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/c');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/a');
  });

  it('changes base with a horizontal swipe, not with a short or vertical one', async () => {
    await open(1);
    const stage = dialog().querySelector('.stage')!;

    stage.dispatchEvent(pointer('pointerdown', 300));
    stage.dispatchEvent(pointer('pointerup', 280));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/b');

    stage.dispatchEvent(pointer('pointerdown', 300, 100));
    stage.dispatchEvent(pointer('pointerup', 240, 300));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/b');

    stage.dispatchEvent(pointer('pointerdown', 300));
    stage.dispatchEvent(pointer('pointerup', 200));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/c');

    stage.dispatchEvent(pointer('pointerdown', 100));
    stage.dispatchEvent(pointer('pointerup', 250));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/b');
  });

  it('moves the pictures with the finger, resisting past the first base', async () => {
    await open(0);
    const stage = dialog().querySelector('.stage')!;
    const track = () => dialog().querySelector<HTMLElement>('.track')!;
    expect(dialog().querySelector('.image--next')!.getAttribute('src')).toBe('/full/b');
    expect(dialog().querySelector('.image--previous')).toBeNull();

    stage.dispatchEvent(pointer('pointerdown', 300));
    stage.dispatchEvent(pointer('pointermove', 260));
    await settle();
    expect(track().style.transform).toBe('translateX(-40px)');

    stage.dispatchEvent(pointer('pointermove', 340));
    await settle();
    expect(track().style.transform).toBe('translateX(10px)');

    stage.dispatchEvent(pointer('pointercancel', 340));
    await settle();
    expect(image().getAttribute('src')).toBe('/full/a');
  });

  it('asks for more bases near the end of the list and shows them when they arrive', async () => {
    await open(0);
    expect(loadMore).not.toHaveBeenCalled();

    nextButton()!.click();
    await settle();
    expect(loadMore).toHaveBeenCalled();

    bases.update((list) => [...list, base('d', 17)]);
    nextButton()!.click();
    await settle();
    nextButton()!.click();
    await settle();
    expect(image().getAttribute('src')).toBe('/full/d');
  });
});
