import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { TablePdf } from '../../pdf/table-pdf';
import { TablePdfExporter } from '../../pdf/table-pdf-exporter';
import { PdfButton } from './pdf-button';

const PDF: TablePdf<string> = {
  fileName: 'test',
  title: 'Test',
  columns: [{ header: 'Name', cell: (row) => row }],
  groups: [{ rows: ['A'] }],
  emptyText: 'None',
};

const FILE = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
const PAGES = [
  new File(['1'], 'test-1.jpg', { type: 'image/jpeg' }),
  new File(['2'], 'test-2.jpg', { type: 'image/jpeg' }),
];

@Component({
  imports: [PdfButton],
  template: `<crn-pdf-button [pdf]="pdf()" />`,
})
class Host {
  pdf = signal<TablePdf<string> | null>(PDF);
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('PdfButton', () => {
  async function create(download: () => Promise<void> = () => Promise.resolve()) {
    const action = new Subject<void>();
    const exporter = {
      download: vi.fn(download),
      file: vi.fn(() => Promise.resolve(FILE)),
      images: vi.fn(() => Promise.resolve(PAGES)),
    };
    const snackBar = { open: vi.fn(() => ({ onAction: () => action })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: TablePdfExporter, useValue: exporter },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    /** Opens a menu (`download` or `share`) and picks one of its items. */
    const pick = async (menu: 'download' | 'share', item: 'pdf' | 'images') => {
      el.querySelector<HTMLButtonElement>(`button.${menu}`)!.click();
      await fixture.whenStable();
      document.querySelector<HTMLButtonElement>(`.${menu}-${item}`)!.click();
      await fixture.whenStable();
      await settle();
      await fixture.whenStable();
    };
    return { fixture, el, exporter, snackBar, action, pick };
  }

  it('downloads the PDF and shows the progress meanwhile', async () => {
    let finish!: () => void;
    const { fixture, el, exporter, pick } = await create(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const button = el.querySelector<HTMLButtonElement>('button.download')!;
    expect(button.textContent).toContain('Scarica');
    await pick('download', 'pdf');
    expect(exporter.download).toHaveBeenCalledWith(PDF);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Creo il file');
    finish();
    await settle();
    await fixture.whenStable();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Scarica');
  });

  it('downloads the pages as pictures, in one archive when more than one', async () => {
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    const { exporter, pick } = await create();
    await pick('download', 'images');
    expect(exporter.images).toHaveBeenCalledWith(PDF);
    expect(saved).toEqual(['test.zip']);

    exporter.images.mockResolvedValueOnce([PAGES[0]]);
    await pick('download', 'images');
    expect(saved).toEqual(['test.zip', 'test-1.jpg']);
    click.mockRestore();
  });

  it('is disabled until the page has its data', async () => {
    const { fixture, el } = await create();
    fixture.componentInstance.pdf.set(null);
    await fixture.whenStable();
    expect(el.querySelector<HTMLButtonElement>('button.download')!.disabled).toBe(true);
  });

  it('tells the user when the file could not be made', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { el, snackBar, pick } = await create(() => Promise.reject(new Error('fonts')));
    await pick('download', 'pdf');
    expect(snackBar.open).toHaveBeenCalledWith(
      'Non è stato possibile creare il file. Riprova.',
      undefined,
      { duration: 4000 },
    );
    expect(el.querySelector<HTMLButtonElement>('button.download')!.disabled).toBe(false);
  });

  it('has no share button where the device cannot share files', async () => {
    const { el } = await create();
    expect(el.querySelector('button.share')).toBeNull();
  });

  describe('sharing', () => {
    let share: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      share = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    });
    afterEach(() => {
      delete (navigator as unknown as Record<string, unknown>)['canShare'];
      delete (navigator as unknown as Record<string, unknown>)['share'];
    });

    it('sends the PDF to the share sheet of the device', async () => {
      const { el, exporter, pick } = await create();
      expect(el.querySelector('button.share')!.textContent).toContain('Condividi');
      await pick('share', 'pdf');
      expect(exporter.file).toHaveBeenCalledWith(PDF);
      expect(share).toHaveBeenCalledWith({ files: [FILE] });
    });

    it('sends the pages as pictures', async () => {
      const { pick } = await create();
      await pick('share', 'images');
      expect(share).toHaveBeenCalledWith({ files: PAGES });
    });

    it('asks for one more tap when the browser refuses a share started too long after the tap', async () => {
      share.mockRejectedValueOnce(new DOMException('No activation', 'NotAllowedError'));
      const { snackBar, action, pick } = await create();
      await pick('share', 'pdf');
      expect(snackBar.open).toHaveBeenCalledWith('File pronto', 'Condividi', { duration: 10000 });
      action.next();
      await settle();
      expect(share).toHaveBeenCalledTimes(2);
    });

    it('says nothing when the user closes the share sheet', async () => {
      share.mockRejectedValueOnce(new DOMException('Closed', 'AbortError'));
      const { snackBar, pick } = await create();
      await pick('share', 'pdf');
      expect(snackBar.open).not.toHaveBeenCalled();
    });
  });
});
