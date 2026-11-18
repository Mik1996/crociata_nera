import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
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
});
