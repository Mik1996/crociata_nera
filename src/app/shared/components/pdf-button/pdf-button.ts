import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { TablePdf } from '../../pdf/table-pdf';
import { TablePdfExporter } from '../../pdf/table-pdf-exporter';
import { zipFiles } from '../../pdf/zip';
import { Icon } from '../icon/icon';

/** What a table is exported as: the PDF, or its pages as pictures (to send in a chat). */
export type ExportKind = 'pdf' | 'images';

/**
 * "Download" button of a table: `<crn-pdf-button [pdf]="lineupPdf()" />`, with a menu: the PDF, or
 * its pages as JPEG pictures (one per page; a ZIP archive of them when more than one). The page describes the table ({@link TablePdf}, `null`
 * while its data is missing: the buttons are disabled); the button shows the progress and tells the
 * user when the file could not be made.
 *
 * Where the device can share files (phones, Safari) a "Share" button, with the same menu, sends the
 * files straight to an app (Telegram, WhatsApp…) through the system's share sheet.
 */
@Component({
  selector: 'crn-pdf-button',
  imports: [MatButtonModule, MatMenuModule, TranslatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pdf-button.html',
  styleUrl: './pdf-button.scss',
})
export class PdfButton {
  private readonly exporter = inject(TablePdfExporter);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);

  readonly pdf = input.required<TablePdf<unknown> | null>();

  protected readonly busy = signal<'download' | 'share' | null>(null);
  /** The device shares files (Web Share API level 2). */
  protected readonly canShare = canSharePdf();

  protected async download(kind: ExportKind): Promise<void> {
    const pdf = this.pdf();
    if (!pdf || this.busy()) return;
    this.busy.set('download');
    try {
      if (kind === 'pdf') await this.exporter.download(pdf);
      else {
        // A click starts one download only: several pages go in one archive.
        const pages = await this.exporter.images(pdf);
        save(pages.length === 1 ? pages[0]! : await zipFiles(pages, `${pdf.fileName}.zip`));
      }
    } catch (error) {
      console.error('[pdf] export failed', error);
      this.snackBar.open(this.language.t('pdf.error'), undefined, { duration: 4000 });
    } finally {
      this.busy.set(null);
    }
  }

  protected async share(kind: ExportKind): Promise<void> {
    const pdf = this.pdf();
    if (!pdf || this.busy()) return;
    this.busy.set('share');
    let files: File[];
    try {
      files = kind === 'pdf' ? [await this.exporter.file(pdf)] : await this.exporter.images(pdf);
    } catch (error) {
      console.error('[pdf] export failed', error);
      this.snackBar.open(this.language.t('pdf.error'), undefined, { duration: 4000 });
      return;
    } finally {
      this.busy.set(null);
    }
    await this.send(files, true);
  }

  /**
   * Opens the share sheet. The browser allows it only right after a tap: when making the files took
   * too long (the first export loads the libraries and the fonts), a notice asks for one more tap.
   */
  private async send(files: File[], firstTry: boolean): Promise<void> {
    try {
      // Files only: with a title, Safari on macOS hands WhatsApp the last file twice. The file names
      // already tell what they are.
      await navigator.share({ files });
    } catch (error) {
      const name = (error as DOMException | null)?.name;
      if (name === 'AbortError') return; // closed by the user
      if (name === 'NotAllowedError' && firstTry) {
        this.snackBar
          .open(this.language.t('pdf.ready'), this.language.t('pdf.share'), { duration: 10000 })
          .onAction()
          .subscribe(() => void this.send(files, false));
        return;
      }
      console.error('[pdf] share failed', error);
      this.snackBar.open(this.language.t('pdf.shareError'), undefined, { duration: 4000 });
    }
  }
}

/** Saves a file through a temporary link. */
function save(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether the device can share a PDF file. */
function canSharePdf(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], 'file.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}
