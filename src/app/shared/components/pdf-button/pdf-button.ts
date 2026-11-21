import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { TablePdf } from '../../pdf/table-pdf';
import { TablePdfExporter } from '../../pdf/table-pdf-exporter';
import { Icon } from '../icon/icon';

/**
 * "Download PDF" button of a table: `<crn-pdf-button [pdf]="lineupPdf()" />`. The page describes
 * the table ({@link TablePdf}, `null` while its data is missing: the buttons are disabled); the
 * button shows the progress and tells the user when the file could not be made.
 *
 * Where the device can share files (phones, Safari) a "Share" button sends the PDF straight to an
 * app (Telegram, WhatsApp…) through the system's share sheet.
 */
@Component({
  selector: 'crn-pdf-button',
  imports: [MatButtonModule, TranslatePipe, Icon],
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

  protected async download(): Promise<void> {
    const pdf = this.pdf();
    if (!pdf || this.busy()) return;
    this.busy.set('download');
    try {
      await this.exporter.download(pdf);
    } catch (error) {
      console.error('[pdf] export failed', error);
      this.snackBar.open(this.language.t('pdf.error'), undefined, { duration: 4000 });
    } finally {
      this.busy.set(null);
    }
  }

  protected async share(): Promise<void> {
    const pdf = this.pdf();
    if (!pdf || this.busy()) return;
    this.busy.set('share');
    let file: File;
    try {
      file = await this.exporter.file(pdf);
    } catch (error) {
      console.error('[pdf] export failed', error);
      this.snackBar.open(this.language.t('pdf.error'), undefined, { duration: 4000 });
      return;
    } finally {
      this.busy.set(null);
    }
    await this.send(file, pdf.title, true);
  }

  /**
   * Opens the share sheet. The browser allows it only right after a tap: when making the file took
   * too long (the first PDF loads the library and the fonts), a notice asks for one more tap.
   */
  private async send(file: File, title: string, firstTry: boolean): Promise<void> {
    try {
      await navigator.share({ files: [file], title });
    } catch (error) {
      const name = (error as DOMException | null)?.name;
      if (name === 'AbortError') return; // closed by the user
      if (name === 'NotAllowedError' && firstTry) {
        this.snackBar
          .open(this.language.t('pdf.ready'), this.language.t('pdf.share'), { duration: 10000 })
          .onAction()
          .subscribe(() => void this.send(file, title, false));
        return;
      }
      console.error('[pdf] share failed', error);
      this.snackBar.open(this.language.t('pdf.shareError'), undefined, { duration: 4000 });
    }
  }
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
