import { DOCUMENT, formatDate } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { CLAN_CREST_URL } from '../../core/api/clan-badge';
import { APP_CONFIG } from '../../core/config/app-config';
import { LanguageService } from '../../core/i18n/language.service';
import { readPdfTheme, TablePdf } from './table-pdf';
import {
  buildTablePdf,
  PDF_FONTS,
  PdfFrame,
  pdfImageUrls,
  PdfTextImage,
  PdfTextStyle,
} from './table-pdf-document';

/** Where the TrueType files of {@link PDF_FONTS} are served (`public/assets/fonts/pdf`). */
const FONTS_PATH = 'assets/fonts/pdf/';
/** Host name printed in the footer of every page. */
const SITE = 'crociatanera.it';
/** Longest side of the pictures drawn into the PDF, in pixels (shown at 20–64 points). */
const CREST_PIXELS = 256;
const PICTURE_PIXELS = 128;
/** Texts drawn as pictures (emoji): pixels per point, for a sharp print. */
const TEXT_SCALE = 4;
/**
 * Fonts of texts drawn as pictures: Inter (loaded by the site) with the colour emoji of the
 * system, then whatever the browser finds for other scripts.
 */
const TEXT_FONTS = `Inter, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;

/**
 * Downloads a {@link TablePdf} as a PDF file in the Crusade's look. The PDF library (pdfmake) and
 * the fonts load only at the first export, so pages pay nothing until a user asks for a file.
 * Built in the browser from the data the page already shows: no backend round trip.
 */
@Injectable({ providedIn: 'root' })
export class TablePdfExporter {
  private readonly language = inject(LanguageService);
  private readonly config = inject(APP_CONFIG);
  private readonly document = inject(DOCUMENT);

  async download(pdf: TablePdf<unknown>): Promise<void> {
    const urls = pdfImageUrls(pdf);
    const [pdfMake, crest, pictures] = await Promise.all([
      loadPdfMake(),
      this.picture(CLAN_CREST_URL, CREST_PIXELS),
      Promise.all(urls.map((url) => this.picture(url, PICTURE_PIXELS))),
      this.loadTextFonts(),
    ]);
    const images: Record<string, string> = {};
    urls.forEach((url, i) => {
      const picture = pictures[i];
      if (picture) images[url] = picture;
    });
    pdfMake.setFonts(this.fontUrls());
    const definition = buildTablePdf(pdf, this.frame(crest, images));
    await pdfMake.createPdf(definition).download(`${pdf.fileName}.pdf`);
  }

  private frame(crest: string | null, images: Record<string, string>): PdfFrame {
    const t = (key: string, params?: Record<string, unknown>) => this.language.t(key, params);
    const date = formatDate(new Date(), t('formats.dateTime'), this.language.current());
    return {
      brand: this.config.clanName,
      clanTag: this.config.clanTag,
      site: SITE,
      generatedAt: t('pdf.generatedAt', { date }),
      page: (n, total) => t('pdf.page', { n, total }),
      fanContent: t('pdf.fanContent'),
      crest,
      images,
      textImage: (text, style) => this.textImage(text, style),
      theme: readPdfTheme(),
    };
  }

  /** Absolute URLs of the font files (pdfmake fetches them itself). */
  private fontUrls(): Record<string, { normal: string; bold: string }> {
    const url = (file: string) => new URL(FONTS_PATH + file, this.document.baseURI).href;
    return Object.fromEntries(
      Object.entries(PDF_FONTS).map(([family, files]) => [
        family,
        { normal: url(files.normal), bold: url(files.bold) },
      ]),
    );
  }

  /**
   * A picture of the site as a PNG data URL (PDFs take PNG or JPEG, the site serves WebP): drawn on
   * a canvas, its longest side at most `pixels`. `null` when it cannot be loaded: the PDF is made
   * without it.
   */
  private async picture(url: string, pixels: number): Promise<string | null> {
    try {
      const image = new Image();
      image.src = new URL(url, this.document.baseURI).href;
      await image.decode();
      const canvas = this.document.createElement('canvas');
      const scale = Math.min(1, pixels / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  /** Waits for Inter (from the site's stylesheet), so names drawn as pictures use it. */
  private async loadTextFonts(): Promise<void> {
    try {
      await Promise.all([
        this.document.fonts.load(`400 ${TEXT_SCALE * 9}px Inter`),
        this.document.fonts.load(`700 ${TEXT_SCALE * 9}px Inter`),
      ]);
    } catch {
      // The system font is used instead.
    }
  }

  /**
   * A text with emoji or other scripts drawn by the browser, which has the fonts for them; its size
   * in points matches the text written around it.
   */
  private textImage(text: string, style: PdfTextStyle): PdfTextImage | null {
    const canvas = this.document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    const font = `${style.bold ? 700 : 400} ${style.size * TEXT_SCALE}px ${TEXT_FONTS}`;
    context.font = font;
    const width = Math.ceil(context.measureText(text).width) + TEXT_SCALE;
    // Line height of the written text (lineHeight 1.1 of the font size, plus room for emoji).
    const height = Math.ceil(style.size * 1.25 * TEXT_SCALE);
    canvas.width = width;
    canvas.height = height;
    // Resizing the canvas resets its state.
    context.font = font;
    context.fillStyle = style.color;
    context.textBaseline = 'middle';
    context.fillText(text, 0, height / 2);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: width / TEXT_SCALE,
      height: height / TEXT_SCALE,
    };
  }
}

/** pdfmake, loaded on demand into its own chunk (it is a CommonJS bundle: default or namespace). */
async function loadPdfMake(): Promise<PdfMake> {
  const module: Partial<{ default: PdfMake }> & PdfMake = await import('pdfmake/build/pdfmake');
  return module.default ?? module;
}

type PdfMake = typeof import('pdfmake/build/pdfmake');
