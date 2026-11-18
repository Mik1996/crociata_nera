import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { DefenseBase } from '../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../testing/fixtures';
import { BasesPdf } from '../pdf/bases-pdf';
import { BasesPdfExporter } from '../pdf/bases-pdf-exporter';
import { BasesPdfEditor } from './bases-pdf-editor';

const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'OK' } });
const base = (id: string, townHallLevel: number, description = ''): DefenseBase => ({
  id,
  townHallLevel,
  layoutUrl: `https://link.clashofclans.com/en?action=OpenLayout&id=TH${townHallLevel}%3AHV%3A${id}`,
  description,
  clanCastleTroops: id === 'a' ? [{ name: 'Golem', count: 1 }] : [],
  image: { key: `key-${id}`, width: 1400, height: 900 },
  createdAt: '2026-11-12T10:00:00Z',
  updatedAt: '2026-11-12T10:00:00Z',
});

const dialog = () => document.querySelector('mat-dialog-container') as HTMLElement;
const query = <T extends Element>(selector: string) => dialog().querySelector<T>(selector)!;
const queryAll = <T extends Element>(selector: string) => [
  ...dialog().querySelectorAll<T>(selector),
];
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input'));
}

describe('BasesPdfEditor', () => {
  let httpMock: HttpTestingController;
  let download: ReturnType<typeof vi.fn>;

  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  async function open() {
    download = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false }),
        { provide: BasesPdfExporter, useValue: { download } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(MatDialog).open(BasesPdfEditor);
    await settle();
    // The whole arsenal is read, page after page.
    httpMock.expectOne('/api/v1/bases').flush(
      ok({
        items: [base('a', 18, 'Anti 3'), base('b', 18)],
        nextCursor: 'c1',
        townHallLevels: [18, 17],
      }),
    );
    await settle();
    httpMock
      .expectOne('/api/v1/bases?cursor=c1')
      .flush(ok({ items: [base('c', 17)], nextCursor: null, townHallLevels: [18, 17] }));
    await settle();
  }

  async function chooseCover() {
    const input = query<HTMLInputElement>('.sheet input[type="file"]');
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    return file;
  }

  // Previews of the cover (jsdom has no object URLs).
  const { createObjectURL, revokeObjectURL } = URL;
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:cover');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    httpMock.verify();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  const pageTitles = () => queryAll('.page-item__th').map((el) => el.textContent!.trim());

  it('lists the whole arsenal and adds or removes a base with a tap', async () => {
    await open();
    const choices = queryAll<HTMLButtonElement>('.choice');
    expect(choices).toHaveLength(3);
    expect(query('.panel__empty').textContent).toContain('Nessuna base nel PDF');

    choices[2].click();
    choices[0].click();
    await settle();
    expect(pageTitles()).toEqual(['TH 17', 'TH 18']);
    expect(choices[0].getAttribute('aria-pressed')).toBe('true');
    // The description starts as the base's own.
    expect(queryAll<HTMLTextAreaElement>('.page-item textarea')[1].value).toBe('Anti 3');

    choices[2].click();
    await settle();
    expect(pageTitles()).toEqual(['TH 18']);
  });

  it('adds every base of the filter and reorders the pages', async () => {
    await open();
    queryAll<HTMLElement>('mat-chip-option [role="option"]')[1].click();
    await settle();
    expect(queryAll('.choice')).toHaveLength(2);
    const addAll = query<HTMLButtonElement>('.add-all');
    expect(addAll.textContent).toContain('(2)');
    addAll.click();
    await settle();
    expect(pageTitles()).toEqual(['TH 18', 'TH 18']);
    expect(addAll.disabled).toBe(true);

    queryAll<HTMLElement>('mat-chip-option [role="option"]')[0].click();
    await settle();
    queryAll<HTMLButtonElement>('.choice')[2].click();
    await settle();
    // Last page up one place, then the first page removed.
    queryAll<HTMLButtonElement>('.page-item')[2]
      .querySelector<HTMLButtonElement>('[aria-label="Sposta su"]')!
      .click();
    await settle();
    expect(pageTitles()).toEqual(['TH 18', 'TH 17', 'TH 18']);
    queryAll<HTMLButtonElement>('.page-item__remove')[0].click();
    await settle();
    expect(pageTitles()).toEqual(['TH 17', 'TH 18']);
  });

  it('changes the reinforcements of a page for the PDF only', async () => {
    await open();
    queryAll<HTMLButtonElement>('.choice')[0].click();
    await settle();
    const summary = query<HTMLButtonElement>('.troops');
    // The base's own, to start with: Golem (30 of the 55 spaces of TH18).
    expect(summary.textContent).toContain('×1');
    expect(summary.textContent).toContain('30/55');
    summary.click();
    await settle();
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    // One Barbarian more.
    query<HTMLButtonElement>(
      '.page-item__picker .catalogue button[aria-label^="Aggiungi Barbarian"]',
    ).click();
    await settle();
    expect(query('.troops').textContent).toContain('31/55');
    query<HTMLButtonElement>('.picker-done').click();
    await settle();
    expect(dialog().querySelector('crn-clan-castle-picker')).toBeNull();

    type(query<HTMLInputElement>('.cover__title input'), 'Basi');
    await chooseCover();
    query<HTMLButtonElement>('.actions__create').click();
    await settle();
    const [pdf] = download.mock.calls[0] as [BasesPdf];
    expect(pdf.pages[0].troops.map((t) => [t.name, t.count])).toEqual([
      ['Golem', 1],
      ['Barbarian', 1],
    ]);
    expect(pdf.pages[0].castleSpace).toBe('31/55 spazi');
  });

  it('says what is missing instead of creating the PDF', async () => {
    await open();
    query<HTMLButtonElement>('.actions__create').click();
    await settle();
    const missing = query('.actions__missing').textContent!;
    expect(missing).toContain('Inserisci il titolo');
    expect(missing).toContain("Scegli l'immagine di copertina");
    expect(missing).toContain('Aggiungi almeno una base');
    expect(download).not.toHaveBeenCalled();
  });

  it('creates the PDF with the cover, the pages in order and their descriptions', async () => {
    await open();
    type(query<HTMLInputElement>('.cover__title input'), '  Basi CWL  ');
    const file = await chooseCover();
    expect(query('.sheet__title').textContent).toContain('Basi CWL');
    const choices = queryAll<HTMLButtonElement>('.choice');
    choices[0].click();
    choices[2].click();
    await settle();
    type(queryAll<HTMLTextAreaElement>('.page-item textarea')[1], 'Solo per il PDF');
    await settle();

    query<HTMLButtonElement>('.actions__create').click();
    await settle();
    expect(download).toHaveBeenCalledTimes(1);
    const [pdf, cover] = download.mock.calls[0] as [BasesPdf, Blob];
    expect(cover).toBe(file);
    expect(pdf.title).toBe('Basi CWL');
    expect(pdf.fileName).toMatch(/^crociata-nera-basi-\d{4}-\d{2}-\d{2}$/);
    expect(pdf.cover).toEqual({ kicker: 'Arsenale basi', summary: '2 basi  ·  Municipio 18–17' });
    expect(pdf.pages.map((p) => [p.heading, p.counter, p.description])).toEqual([
      ['Municipio 18', 'Base 1 di 2', 'Anti 3'],
      ['Municipio 17', 'Base 2 di 2', 'Solo per il PDF'],
    ]);
    expect(pdf.pages[0]).toMatchObject({
      image: '/api/v1/base-images/key-a/full',
      layoutUrl: base('a', 18).layoutUrl,
      castleSpace: '30/55 spazi',
      troops: [{ name: 'Golem', count: 1, icon: expect.stringContaining('golem') }],
    });
    expect(document.body.textContent).toContain('PDF delle basi creato');
  });
});
