import { inject, Injectable } from '@angular/core';
import { pdfPagesAsImages } from './pdf-pages';
import { PdfToolkit } from './pdf-toolkit';
import { TablePdf } from './table-pdf';
import { buildTablePdf, pdfImageUrls } from './table-pdf-document';

/** Longest side of the pictures of the image cells, in pixels (shown at 20–64 points). */
const PICTURE_PIXELS = 128;

/**
 * Downloads a {@link TablePdf} as a PDF file in the Crusade's iron look, or makes the file to share. The PDF library (pdfmake) and
 * the fonts load only at the first export ({@link PdfToolkit}), so pages pay nothing until a user
 * asks for a file. Built in the browser from the data the page already shows: no backend round trip.
 */
@Injectable({ providedIn: 'root' })
export class TablePdfExporter {
  private readonly toolkit = inject(PdfToolkit);

  async download(pdf: TablePdf<unknown>): Promise<void> {
    await (await this.document(pdf)).download(`${pdf.fileName}.pdf`);
  }

  /** The pages of the PDF as JPEG files (to send in a chat). */
  async images(pdf: TablePdf<unknown>): Promise<File[]> {
    return pdfPagesAsImages(await (await this.document(pdf)).getBlob(), pdf.fileName);
  }

  /** The PDF as a file (to share it). */
  async file(pdf: TablePdf<unknown>): Promise<File> {
    const blob = await (await this.document(pdf)).getBlob();
    return new File([blob], `${pdf.fileName}.pdf`, { type: 'application/pdf' });
  }

  private async document(pdf: TablePdf<unknown>) {
    const [pdfMake, crest, images] = await Promise.all([
      this.toolkit.pdfMake(),
      this.toolkit.crest(),
      this.toolkit.pictures(pdfImageUrls(pdf), PICTURE_PIXELS),
    ]);
    const plate = this.toolkit.ironPlate(pdf.orientation);
    return pdfMake.createPdf(buildTablePdf(pdf, this.toolkit.frame(crest, images), plate));
  }
}
