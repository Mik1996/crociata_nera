import { inject, Injectable } from '@angular/core';
import { PdfToolkit } from '../../../shared/pdf/pdf-toolkit';
import { cssColorAlpha } from '../../../shared/styles/css-color';
import { BasesPdf, basesPdfImageUrls } from './bases-pdf';
import { buildBasesPdf } from './bases-pdf-document';

/** Screenshots: longest side in pixels (drawn about 520 points wide: ~190 dpi), as JPEG. */
const SCREENSHOT_PIXELS = 1400;
/** Town halls and troops (drawn at 30–46 points). */
const ICON_PIXELS = 160;
/** The cover, an A4 page at about 150 dpi. */
const COVER_WIDTH = 1240;
const COVER_HEIGHT = 1754;

/**
 * Downloads a {@link BasesPdf} as a PDF file. Like the table exports it is made in the browser
 * (pdfmake and fonts load at the first export, `PdfToolkit`): the screenshots are already served
 * by the site, the cover is the file picked in the editor and never leaves the device.
 */
@Injectable({ providedIn: 'root' })
export class BasesPdfExporter {
  private readonly toolkit = inject(PdfToolkit);

  /** `cover`: the picture picked in the editor (any image the browser can read), or `null`. */
  async download(pdf: BasesPdf, cover: Blob | null): Promise<void> {
    const urls = basesPdfImageUrls(pdf);
    const [pdfMake, crest, screenshots, icons, coverImage] = await Promise.all([
      this.toolkit.pdfMake(),
      this.toolkit.crest(),
      this.toolkit.pictures(urls.screenshots, SCREENSHOT_PIXELS, 'jpeg'),
      this.toolkit.pictures(urls.icons, ICON_PIXELS),
      cover ? this.coverImage(cover) : Promise.resolve(null),
    ]);
    const frame = this.toolkit.frame(crest, { ...screenshots, ...icons });
    const art = { cover: coverImage, page: this.toolkit.ironPlate() };
    await pdfMake.createPdf(buildBasesPdf(pdf, frame, art)).download(`${pdf.fileName}.pdf`);
  }

  /**
   * The cover picture shaped for an A4 page: cropped to fill it (centred), darkened at the top and
   * the bottom where the clan's name and the footer are written, and behind the title, with a red
   * vignette. A JPEG data URL; `null` when the file cannot be read.
   */
  async coverImage(file: Blob): Promise<string | null> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return null;
    }
    const canvas = this.toolkit.canvas(COVER_WIDTH, COVER_HEIGHT);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return null;
    }
    const w = COVER_WIDTH;
    const h = COVER_HEIGHT;
    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (w - drawWidth) / 2, (h - drawHeight) / 2, drawWidth, drawHeight);
    bitmap.close();

    const dark = (alpha: number) => cssColorAlpha('--cn-pdf-band', alpha);
    const red = (alpha: number) => cssColorAlpha('--cn-pdf-red', alpha);
    // The whole picture a little darker, so the gold reads anywhere.
    context.fillStyle = dark(0.28);
    context.fillRect(0, 0, w, h);
    // Red vignette.
    const vignette = context.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
    vignette.addColorStop(0, red(0));
    vignette.addColorStop(1, red(0.55));
    context.fillStyle = vignette;
    context.fillRect(0, 0, w, h);
    // Top: crest and clan name.
    const top = context.createLinearGradient(0, 0, 0, h * 0.36);
    top.addColorStop(0, dark(0.92));
    top.addColorStop(0.6, dark(0.6));
    top.addColorStop(1, dark(0));
    context.fillStyle = top;
    context.fillRect(0, 0, w, h * 0.36);
    // Middle: the title.
    const middle = context.createLinearGradient(0, h * 0.32, 0, h * 0.68);
    middle.addColorStop(0, dark(0));
    middle.addColorStop(0.5, dark(0.62));
    middle.addColorStop(1, dark(0));
    context.fillStyle = middle;
    context.fillRect(0, h * 0.32, w, h * 0.36);
    // Bottom: the footer.
    const bottom = context.createLinearGradient(0, h * 0.78, 0, h);
    bottom.addColorStop(0, dark(0));
    bottom.addColorStop(1, dark(0.95));
    context.fillStyle = bottom;
    context.fillRect(0, h * 0.78, w, h * 0.22);
    return canvas.toDataURL('image/jpeg', 0.86);
  }
}
