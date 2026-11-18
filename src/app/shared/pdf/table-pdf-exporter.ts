import { inject, Injectable } from '@angular/core';
import { PdfToolkit } from './pdf-toolkit';
import { TablePdf } from './table-pdf';
import { buildTablePdf, pdfImageUrls } from './table-pdf-document';

/** Longest side of the pictures of the image cells, in pixels (shown at 20–64 points). */
const PICTURE_PIXELS = 128;

/**
 * Downloads a {@link TablePdf} as a PDF file in the Crusade's iron look. The PDF library (pdfmake) and
 * the fonts load only at the first export ({@link PdfToolkit}), so pages pay nothing until a user
 * asks for a file. Built in the browser from the data the page already shows: no backend round trip.
 */
@Injectable({ providedIn: 'root' })
export class TablePdfExporter {
  private readonly toolkit = inject(PdfToolkit);

  async download(pdf: TablePdf<unknown>): Promise<void> {
    const [pdfMake, crest, images] = await Promise.all([
      this.toolkit.pdfMake(),
      this.toolkit.crest(),
      this.toolkit.pictures(pdfImageUrls(pdf), PICTURE_PIXELS),
    ]);
    const plate = this.toolkit.ironPlate(pdf.orientation);
    const definition = buildTablePdf(pdf, this.toolkit.frame(crest, images), plate);
    await pdfMake.createPdf(definition).download(`${pdf.fileName}.pdf`);
  }
}
