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

@Component({
  imports: [PdfButton],
  template: `<crn-pdf-button [pdf]="pdf()" />`,
})
class Host {
  pdf = signal<TablePdf<string> | null>(PDF);
}

describe('PdfButton', () => {
  async function create(download: () => Promise<void>) {
    const exporter = { download: vi.fn(download) };
    const snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: TablePdfExporter, useValue: exporter },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    return { fixture, button, exporter, snackBar };
  }

  it('downloads the table and shows the progress meanwhile', async () => {
    let finish!: () => void;
    const { fixture, button, exporter } = await create(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    expect(button.textContent).toContain('Scarica PDF');
    button.click();
    await fixture.whenStable();
    expect(exporter.download).toHaveBeenCalledWith(PDF);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Creo il PDF');
    // A second click while busy does nothing.
    button.click();
    expect(exporter.download).toHaveBeenCalledTimes(1);
    finish();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Scarica PDF');
  });

  it('is disabled until the page has its data', async () => {
    const { fixture, button } = await create(() => Promise.resolve());
    fixture.componentInstance.pdf.set(null);
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
  });

  it('tells the user when the file could not be made', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture, button, snackBar } = await create(() => Promise.reject(new Error('fonts')));
    button.click();
    await fixture.whenStable();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Non è stato possibile creare il PDF. Riprova.',
      undefined,
      { duration: 4000 },
    );
    expect(button.disabled).toBe(false);
  });

  describe('sharing', () => {
    const FILE = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
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

    async function createSharing() {
      const action = new Subject<void>();
      const exporter = { download: vi.fn(), file: vi.fn(() => Promise.resolve(FILE)) };
      const snackBar = { open: vi.fn(() => ({ onAction: () => action })) };
      TestBed.configureTestingModule({
        providers: [
          { provide: TablePdfExporter, useValue: exporter },
          { provide: MatSnackBar, useValue: snackBar },
        ],
      });
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.share',
      )!;
      return { fixture, button, exporter, snackBar, action };
    }

    it('sends the PDF to the share sheet of the device', async () => {
      const { fixture, button, exporter } = await createSharing();
      expect(button.textContent).toContain('Condividi');
      button.click();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      expect(exporter.file).toHaveBeenCalledWith(PDF);
      expect(share).toHaveBeenCalledWith({ files: [FILE], title: 'Test' });
    });

    it('asks for one more tap when the browser refuses a share started too long after the tap', async () => {
      share.mockRejectedValueOnce(new DOMException('No activation', 'NotAllowedError'));
      const { fixture, button, snackBar, action } = await createSharing();
      button.click();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      expect(snackBar.open).toHaveBeenCalledWith('PDF pronto', 'Condividi', { duration: 10000 });
      action.next();
      await new Promise((resolve) => setTimeout(resolve));
      expect(share).toHaveBeenCalledTimes(2);
    });

    it('says nothing when the user closes the share sheet', async () => {
      share.mockRejectedValueOnce(new DOMException('Closed', 'AbortError'));
      const { fixture, button, snackBar } = await createSharing();
      button.click();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      expect(snackBar.open).not.toHaveBeenCalled();
    });
  });

  it('has no share button where the device cannot share files', async () => {
    const { fixture } = await create(() => Promise.resolve());
    expect((fixture.nativeElement as HTMLElement).querySelector('.share')).toBeNull();
  });
});
