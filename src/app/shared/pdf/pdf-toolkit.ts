import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { CLAN_CREST_URL } from '../../core/api/clan-badge';
import { APP_CONFIG } from '../../core/config/app-config';
import { LanguageService } from '../../core/i18n/language.service';
// Also registers the locale data of the languages: a page may export without using the pipes.
import { formatLocalDate } from '../../core/i18n/locale-pipes';
import { readPdfTheme } from './table-pdf';
import { PDF_FONTS, PdfFrame, PdfTextImage, PdfTextStyle } from './table-pdf-document';

/** Where the TrueType files of {@link PDF_FONTS} are served (`public/assets/fonts/pdf`). */
const FONTS_PATH = 'assets/fonts/pdf/';
/** Host name printed in the footer of every page. */
const SITE = 'crociatanera.it';
/** Longest side of the crest drawn into the PDF, in pixels (shown at up to 64 points). */
const CREST_PIXELS = 256;
/** Texts drawn as pictures (emoji): pixels per point, for a sharp print. */
const TEXT_SCALE = 4;
/** Line height of a paragraph drawn as a picture, as a multiple of the font size. */
const PARAGRAPH_LINE_HEIGHT = 1.35;
/**
 * Fonts of texts drawn as pictures: Inter (loaded by the site) with the colour emoji of the
 * system, then whatever the browser finds for other scripts.
 */
const TEXT_FONTS = `Inter, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;

export type PdfMake = typeof import('pdfmake/build/pdfmake');

/** What a picture of the site becomes in the PDF: PNG keeps transparency, JPEG is much smaller. */
export type PdfPictureFormat = 'png' | 'jpeg';

/**
 * The browser side of the PDF exports, shared by every kind of document: loads pdfmake and the
 * fonts on demand (first export only), turns the site's pictures into PNG/JPEG data URLs, draws
 * the texts the PDF fonts cannot (emoji) and frames the document (clan, date, footer texts).
 */
@Injectable({ providedIn: 'root' })
export class PdfToolkit {
  private readonly language = inject(LanguageService);
  private readonly config = inject(APP_CONFIG);
  private readonly document = inject(DOCUMENT);

  /** pdfmake with the fonts of {@link PDF_FONTS}; Inter is ready for the texts drawn as pictures. */
  async pdfMake(): Promise<PdfMake> {
    const [pdfMake] = await Promise.all([loadPdfMake(), this.loadTextFonts()]);
    pdfMake.setFonts(this.fontUrls());
    return pdfMake;
  }

  /** The clan crest, for the header of the pages. */
  crest(): Promise<string | null> {
    return this.picture(CLAN_CREST_URL, CREST_PIXELS);
  }

  /** Several pictures at once (URL → data URL); those that cannot be loaded are left out. */
  async pictures(
    urls: readonly string[],
    pixels: number,
    format: PdfPictureFormat = 'png',
  ): Promise<Record<string, string>> {
    const loaded = await Promise.all(urls.map((url) => this.picture(url, pixels, format)));
    const pictures: Record<string, string> = {};
    urls.forEach((url, i) => {
      const picture = loaded[i];
      if (picture) pictures[url] = picture;
    });
    return pictures;
  }

  /**
   * A picture of the site as a PNG or JPEG data URL (PDFs take nothing else, the site serves WebP):
   * drawn on a canvas, its longest side at most `pixels`. `null` when it cannot be loaded: the PDF
   * is made without it.
   */
  async picture(
    url: string,
    pixels: number,
    format: PdfPictureFormat = 'png',
  ): Promise<string | null> {
    try {
      const image = new Image();
      image.src = new URL(url, this.document.baseURI).href;
      await image.decode();
      const scale = Math.min(1, pixels / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = this.canvas(
        Math.round(image.naturalWidth * scale),
        Math.round(image.naturalHeight * scale),
      );
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return format === 'jpeg'
        ? canvas.toDataURL('image/jpeg', 0.86)
        : canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  /** A canvas of the document (at least 1 × 1 pixel), to draw pictures of the PDF on. */
  canvas(width: number, height: number): HTMLCanvasElement {
    const canvas = this.document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    return canvas;
  }

  /** Clan, date, footer texts and colours around the content of a document. */
  frame(crest: string | null, images: Readonly<Record<string, string>>): PdfFrame {
    const t = (key: string, params?: Record<string, unknown>) => this.language.t(key, params);
    const date = formatLocalDate(new Date(), t('formats.dateTime'), this.language.current());
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
   * in points matches the text written around it. With `style.maxWidth` it is a paragraph: its
   * words wrap at that width (in points) and its line breaks are kept.
   */
  private textImage(text: string, style: PdfTextStyle): PdfTextImage | null {
    const probe = this.document.createElement('canvas').getContext('2d');
    if (!probe) return null;
    const font = `${style.bold ? 700 : 400} ${style.size * TEXT_SCALE}px ${TEXT_FONTS}`;
    probe.font = font;
    const maxWidth = style.maxWidth ? style.maxWidth * TEXT_SCALE : undefined;
    const lines = maxWidth ? wrapText(text, maxWidth, (s) => probe.measureText(s).width) : [text];
    const widest = Math.max(...lines.map((line) => probe.measureText(line).width));
    // Line height of the written text (lineHeight 1.1 of the font size, plus room for emoji).
    const lineHeight = style.size * (maxWidth ? PARAGRAPH_LINE_HEIGHT : 1.25) * TEXT_SCALE;
    const canvas = this.canvas(
      Math.ceil(maxWidth ?? widest + TEXT_SCALE),
      Math.ceil(lineHeight * lines.length),
    );
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.font = font;
    context.fillStyle = style.color;
    context.textBaseline = 'middle';
    lines.forEach((line, i) => context.fillText(line, 0, lineHeight * (i + 0.5)));
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width / TEXT_SCALE,
      height: canvas.height / TEXT_SCALE,
    };
  }
}

/**
 * The lines of a paragraph at most `maxWidth` wide (as `measure` tells): words wrap, line breaks
 * are kept, a word longer than a line is cut where it overflows.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
      const next = line + word;
      if (!line || measure(next) <= maxWidth) {
        line = next;
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
      // A single word wider than the line: cut it.
      while (measure(line) > maxWidth && [...line].length > 1) {
        const chars = [...line];
        let fit = chars.length - 1;
        while (fit > 1 && measure(chars.slice(0, fit).join('')) > maxWidth) fit--;
        lines.push(chars.slice(0, fit).join(''));
        line = chars.slice(fit).join('');
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** pdfmake, loaded on demand into its own chunk (it is a CommonJS bundle: default or namespace). */
async function loadPdfMake(): Promise<PdfMake> {
  const module: Partial<{ default: PdfMake }> & PdfMake = await import('pdfmake/build/pdfmake');
  return module.default ?? module;
}
