import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DefenseBase } from '../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../testing/fixtures';
import { BaseFormDialog, BaseFormDialogData, layoutLinkValidator } from './base-form-dialog';

const LINK = 'https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd';
const LINK_17 = 'https://link.clashofclans.com/en?action=OpenLayout&id=TH17%3AHV%3ABBBBFQAAAALR';
const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'OK' } });
const saved: DefenseBase = {
  id: 'b1',
  townHallLevel: 18,
  layoutUrl: LINK,
  description: 'Castello: Drago',
  image: { key: 'key', width: 1400, height: 700 },
  createdAt: '2026-11-12T10:00:00Z',
  updatedAt: '2026-11-12T10:00:00Z',
};

const dialog = () => document.querySelector('mat-dialog-container') as HTMLElement;
const query = <T extends Element>(selector: string) => dialog().querySelector<T>(selector)!;
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input'));
}

describe('layoutLinkValidator', () => {
  it('accepts empty fields (left to required) and home village layout links only', () => {
    expect(layoutLinkValidator(new FormControl(''))).toBeNull();
    expect(layoutLinkValidator(new FormControl(LINK))).toBeNull();
    expect(layoutLinkValidator(new FormControl('https://example.com'))).toEqual({ layoutLink: true });
  });
});

describe('BaseFormDialog', () => {
  let httpMock: HttpTestingController;
  let ref: MatDialogRef<BaseFormDialog, DefenseBase>;

  async function open(data: BaseFormDialogData = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false }),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    ref = TestBed.inject(MatDialog).open(BaseFormDialog, { data });
    await settle();
  }

  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  /** The browser decodes and re-encodes the image: faked, jsdom has no canvas. */
  function fakeImageApis(width = 3000, height = 1500) {
    vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => undefined }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
    ) {
      callback(new Blob([`${this.width}x${this.height}`], { type }));
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }));
  }

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.inject(MatDialog).closeAll();
  });

  it('checks the link and asks for an image before sending anything', async () => {
    await open();
    expect(dialog().textContent).toContain('Nuova base difensiva');
    type(query('input[formcontrolname="layoutUrl"]'), 'https://example.com/base');
    query<HTMLButtonElement>('button[type="submit"]').click();
    await settle();
    expect(dialog().textContent).toContain('Link non valido');
    expect(dialog().textContent).toContain("Aggiungi un'immagine della base.");
    httpMock.expectNone('/api/v1/bases');
  });

  it('reads the town hall from the link and sends the shrunk image', async () => {
    fakeImageApis();
    await open();
    type(query('input[formcontrolname="layoutUrl"]'), LINK);
    await settle();
    expect(dialog().textContent).toContain('Municipio 18, ricavato dal link');

    const file = new File(['png'], 'base.png', { type: 'image/png' });
    await ref.componentInstance.pick(file);
    await settle();
    expect(query<HTMLImageElement>('.drop__preview').src).toBe('blob:preview');

    type(query('textarea'), '  Castello: Drago  ');
    query<HTMLButtonElement>('button[type="submit"]').click();
    const post = httpMock.expectOne('/api/v1/bases');
    const body = post.request.body as FormData;
    expect(body.get('layoutUrl')).toBe(LINK);
    expect(body.get('description')).toBe('Castello: Drago');
    const image = body.get('image') as Blob;
    expect(image.type).toBe('image/webp');
    expect(await image.text()).toBe('2000x1000');

    const closed = new Promise<DefenseBase | undefined>((resolve) => ref.afterClosed().subscribe(resolve));
    post.flush(ok(saved));
    expect(await closed).toEqual(saved);
  });

  it('refuses files that are not images', async () => {
    await open();
    await ref.componentInstance.pick(new File(['%PDF'], 'base.pdf', { type: 'application/pdf' }));
    await settle();
    expect(dialog().textContent).toContain('Immagine non valida');
  });

  it('is prefilled when editing and sends only the changed fields', async () => {
    await open({ base: saved, imageUrl: '/api/v1/base-images/key/full' });
    expect(dialog().textContent).toContain('Modifica base difensiva');
    expect(query<HTMLInputElement>('input[formcontrolname="layoutUrl"]').value).toBe(LINK);
    expect(query<HTMLTextAreaElement>('textarea').value).toBe('Castello: Drago');
    expect(query<HTMLImageElement>('.drop__preview').getAttribute('src')).toBe('/api/v1/base-images/key/full');

    type(query('input[formcontrolname="layoutUrl"]'), LINK_17);
    query<HTMLButtonElement>('button[type="submit"]').click();
    const patch = httpMock.expectOne('/api/v1/bases/b1');
    expect(patch.request.method).toBe('PATCH');
    const body = patch.request.body as FormData;
    expect([...body.keys()]).toEqual(['layoutUrl']);

    // Errors of the backend go under their field.
    patch.flush(
      { result: null, messages: [{ key: 'ERROR.BASE_ALREADY_EXISTS', field: 'layoutUrl' }] },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(dialog().textContent).toContain("Questa base è già nell'arsenale.");
  });

  it('closes without a request when nothing changed', async () => {
    await open({ base: saved, imageUrl: '/x' });
    const closed = new Promise<DefenseBase | undefined>((resolve) => ref.afterClosed().subscribe(resolve));
    query<HTMLButtonElement>('button[type="submit"]').click();
    expect(await closed).toBeUndefined();
  });
});
