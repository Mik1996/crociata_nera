import { inject, Injectable } from '@angular/core';
import { PdfToolkit } from '../../../shared/pdf/pdf-toolkit';
import { cssColor, cssColorAlpha } from '../../../shared/styles/css-color';
import { BasesPdf, basesPdfImageUrls, IronPdfTheme } from './bases-pdf';
import { buildBasesPdf } from './bases-pdf-document';

/** Screenshots: longest side in pixels (drawn about 520 points wide: ~190 dpi), as JPEG. */
const SCREENSHOT_PIXELS = 1400;
/** Town halls and troops (drawn at 30–46 points). */
const ICON_PIXELS = 160;
/** The cover, an A4 page at about 150 dpi. */
const COVER_WIDTH = 1240;
const COVER_HEIGHT = 1754;
/** The iron behind the base pages: smooth gradients, a lower resolution is enough. */
const PAGE_PIXELS_WIDTH = 992;
const PAGE_PIXELS_HEIGHT = 1403;

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
    const art = { cover: coverImage, page: this.ironImage(), iron: readIronTheme() };
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

  /**
   * Brushed black iron behind the base pages, as the site's "iron" theme: a warm sheen at the top,
   * the ember glow at the foot of the page, a dark crimson vignette and fine horizontal strokes.
   * Made once per document (every page shows the same picture). A JPEG data URL.
   */
  ironImage(): string | null {
    const canvas = this.toolkit.canvas(PAGE_PIXELS_WIDTH, PAGE_PIXELS_HEIGHT);
    const context = canvas.getContext('2d');
    if (!context) return null;
    const w = PAGE_PIXELS_WIDTH;
    const h = PAGE_PIXELS_HEIGHT;
    context.fillStyle = cssColor('--cn-pdf-iron-bg');
    context.fillRect(0, 0, w, h);
    // Fine strokes of brushed metal, the same every time (seeded).
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < h; y += 2) {
      context.fillStyle = cssColorAlpha('--cn-pdf-iron-text', 0.006 + random() * 0.018);
      const x = random() * w * 0.3;
      context.fillRect(x, y, w * (0.5 + random() * 0.5), 1);
    }
    const sheen = context.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, h * 0.55);
    sheen.addColorStop(0, cssColorAlpha('--cn-pdf-gold-text', 0.1));
    sheen.addColorStop(1, cssColorAlpha('--cn-pdf-gold-text', 0));
    context.fillStyle = sheen;
    context.fillRect(0, 0, w, h);
    const ember = context.createRadialGradient(w * 0.6, h * 1.08, 0, w * 0.6, h * 1.08, h * 0.5);
    ember.addColorStop(0, cssColorAlpha('--cn-pdf-iron-ember', 0.3));
    ember.addColorStop(1, cssColorAlpha('--cn-pdf-iron-ember', 0));
    context.fillStyle = ember;
    context.fillRect(0, 0, w, h);
    const vignette = context.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.78);
    vignette.addColorStop(0, cssColorAlpha('--cn-pdf-iron-crimson', 0));
    vignette.addColorStop(1, cssColorAlpha('--cn-pdf-iron-crimson', 0.4));
    context.fillStyle = vignette;
    context.fillRect(0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  }
}

/** The colours of the pages, from the palette (identity tokens: the same in every theme). */
export function readIronTheme(): IronPdfTheme {
  return {
    bg: cssColor('--cn-pdf-iron-bg'),
    plate: cssColor('--cn-pdf-iron-plate'),
    tile: cssColor('--cn-pdf-iron-tile'),
    edge: cssColor('--cn-pdf-iron-edge'),
    text: cssColor('--cn-pdf-iron-text'),
    muted: cssColor('--cn-pdf-iron-muted'),
    gold: cssColor('--cn-pdf-gold'),
    goldText: cssColor('--cn-pdf-gold-text'),
    ember: cssColor('--cn-pdf-iron-ember'),
    qrInk: cssColor('--cn-pdf-band'),
    qrPaper: cssColor('--cn-pdf-band-text'),
  };
}
