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
 * the table ({@link TablePdf}, `null` while its data is missing: the button is disabled); the
 * button shows the progress and tells the user when the file could not be made.
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

  protected readonly busy = signal(false);

  protected async download(): Promise<void> {
    const pdf = this.pdf();
    if (!pdf || this.busy()) return;
    this.busy.set(true);
    try {
      await this.exporter.download(pdf);
    } catch (error) {
      console.error('[pdf] export failed', error);
      this.snackBar.open(this.language.t('pdf.error'), undefined, { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }
}
