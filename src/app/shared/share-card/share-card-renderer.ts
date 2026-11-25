import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { paintIronPlate } from '../pdf/iron-plate';
import { cssColor, cssColorAlpha } from '../styles/css-color';
import { fitText, SHARE_CARD_SIZES, SHARE_SITE, ShareCard, ShareCardFormat } from './share-card';

/** The TrueType files of the PDFs (`public/assets/fonts/pdf`), loaded under names of their own. */
const FONTS_PATH = 'assets/fonts/pdf/';
const FONT_FILES: readonly { family: string; file: string; weight: string }[] = [
  { family: 'CrnCardDecorative', file: 'CinzelDecorative-Black.ttf', weight: '900' },
  { family: 'CrnCardCinzel', file: 'Cinzel-Bold.ttf', weight: '700' },
  { family: 'CrnCardInter', file: 'Inter-Regular.ttf', weight: '400' },
  { family: 'CrnCardInter', file: 'Inter-Bold.ttf', weight: '700' },
];
/** Emoji and other scripts come from the system fonts, glyph by glyph. */
const FALLBACK = `'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
const DISPLAY = `CrnCardDecorative, CrnCardCinzel, ${FALLBACK}`;
const HEADING = `CrnCardCinzel, ${FALLBACK}`;
const BODY = `CrnCardInter, ${FALLBACK}`;

/** Sizes in pixels of each format; text sizes as [largest, smallest]. */
interface CardLayout {
  frameOuter: number;
  frameInner: number;
  headerTop: number;
  crest: number;
  clan: number;
  kicker: number;
  medal: number;
  title: [number, number];
  tier: number;
  player: [number, number];
  detail: number;
  /** `null`: no requirement on the card. */
  description: number | null;
  gap: number;
  site: number;
  notice: number;
  /** Width of the texts. */
  textWidth: number;
}

const LAYOUTS: Record<ShareCardFormat, CardLayout> = {
  square: {
    frameOuter: 34,
    frameInner: 46,
    headerTop: 84,
    crest: 80,
    clan: 40,
    kicker: 24,
    medal: 400,
    title: [72, 44],
    tier: 30,
    player: [56, 34],
    detail: 30,
    description: null,
    gap: 16,
    site: 32,
    notice: 16,
    textWidth: 880,
  },
  story: {
    frameOuter: 40,
    frameInner: 54,
    headerTop: 150,
    crest: 112,
    clan: 52,
    kicker: 32,
    medal: 700,
    title: [96, 56],
    tier: 40,
    player: [76, 44],
    detail: 40,
    description: 36,
    gap: 30,
    site: 42,
    notice: 21,
    textWidth: 860,
  },
};

/** A block of the column under the header: its height and how it is drawn at a given top. */
interface Block {
  height: number;
  draw: (top: number) => void;
}

/**
 * Draws {@link ShareCard}s as PNG files on a canvas: brushed iron in a double gold frame with studs
 * (as the PDFs), the clan crest and name, the medal in 3D on a soft glow, its name and tier, the
 * player and the period, and at the foot the site and the fan content notice.
 * The fonts are those of the PDFs, loaded with the first card.
 */
@Injectable({ providedIn: 'root' })
export class ShareCardRenderer {
  private readonly document = inject(DOCUMENT);
  private fonts: Promise<void> | null = null;

  async render(card: ShareCard): Promise<Blob> {
    const { width, height } = SHARE_CARD_SIZES[card.format];
    const layout = LAYOUTS[card.format];
    const [, crest, medal] = await Promise.all([
      this.loadFonts(),
      this.image(card.crest),
      this.image(card.medal3d ?? card.medalSvg),
    ]);
    const canvas = this.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas');
    paintIronPlate(context, width, height);
    drawFrame(context, width, height, layout);
    const headerBottom = drawHeader(context, width, layout, card.clan, crest);
    const footerTop = drawFooter(context, width, height, layout, card.fanContent);
    drawColumn(context, width, headerBottom, footerTop, layout, card, medal);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Card not drawn'))), 'image/png'),
    );
  }

  /** The fonts of the card; a font that cannot be loaded leaves the system one. */
  private loadFonts(): Promise<void> {
    this.fonts ??= Promise.all(
      FONT_FILES.map(async ({ family, file, weight }) => {
        try {
          const url = new URL(FONTS_PATH + file, this.document.baseURI).href;
          const face = new FontFace(family, `url(${url})`, { weight });
          this.document.fonts.add(await face.load());
        } catch {
          // Drawn with the fallback font.
        }
      }),
    ).then(() => undefined);
    return this.fonts;
  }

  /** A picture of the site, `null` when it cannot be loaded (the card is drawn without it). */
  private async image(url: string): Promise<HTMLImageElement | null> {
    try {
      const image = new Image();
      image.src = new URL(url, this.document.baseURI).href;
      await image.decode();
      return image;
    } catch {
      return null;
    }
  }
}

/** Double gold frame with a stud in each corner. */
function drawFrame(c: CanvasRenderingContext2D, w: number, h: number, l: CardLayout): void {
  c.strokeStyle = cssColor('--cn-pdf-gold');
  c.lineWidth = 3;
  c.strokeRect(l.frameOuter, l.frameOuter, w - l.frameOuter * 2, h - l.frameOuter * 2);
  c.strokeStyle = cssColor('--cn-pdf-iron-edge');
  c.lineWidth = 1.5;
  c.strokeRect(l.frameInner, l.frameInner, w - l.frameInner * 2, h - l.frameInner * 2);
  for (const [x, y] of [
    [l.frameOuter, l.frameOuter],
    [w - l.frameOuter, l.frameOuter],
    [l.frameOuter, h - l.frameOuter],
    [w - l.frameOuter, h - l.frameOuter],
  ] as const) {
    circle(c, x, y, 9, cssColor('--cn-pdf-gold'));
    circle(c, x - 2.5, y - 2.5, 3.2, cssColor('--cn-pdf-gold-text'));
  }
}

/** Crest and clan name side by side, centred, over a gold rule. Returns the bottom of the rule. */
function drawHeader(
  c: CanvasRenderingContext2D,
  w: number,
  l: CardLayout,
  clan: string,
  crest: HTMLImageElement | null,
): number {
  c.font = `700 ${l.clan}px ${HEADING}`;
  const nameWidth = Math.min(c.measureText(clan).width, l.textWidth - l.crest);
  const crestWidth = crest ? l.crest + l.clan * 0.5 : 0;
  const left = (w - crestWidth - nameWidth) / 2;
  const middle = l.headerTop + l.crest / 2;
  if (crest) {
    const scale = l.crest / Math.max(crest.naturalWidth, crest.naturalHeight);
    const cw = crest.naturalWidth * scale;
    const ch = crest.naturalHeight * scale;
    c.drawImage(crest, left + (l.crest - cw) / 2, middle - ch / 2, cw, ch);
  }
  c.fillStyle = cssColor('--cn-pdf-gold-text');
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(clan, left + crestWidth, middle, nameWidth);
  const rule = l.headerTop + l.crest + l.gap * 1.5;
  ornament(c, w / 2, rule, l.textWidth * 0.6);
  return rule;
}

/** Gold rule, site and fan content notice at the foot. Returns the top of the rule. */
function drawFooter(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  l: CardLayout,
  notice: string,
): number {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `400 ${l.notice}px ${BODY}`;
  const lines = fitText(notice, l.textWidth, l.notice, l.notice, 3, (text) => c.measureText(text).width).lines;
  const lineHeight = l.notice * 1.35;
  const noticeTop = h - l.frameInner - l.gap * 1.5 - lineHeight * lines.length;
  c.fillStyle = cssColor('--cn-pdf-iron-muted');
  lines.forEach((line, i) => c.fillText(line, w / 2, noticeTop + lineHeight * (i + 0.5)));
  const siteMiddle = noticeTop - l.gap - l.site / 2;
  c.font = `700 ${l.site}px ${HEADING}`;
  c.fillStyle = cssColor('--cn-pdf-gold-text');
  spaced(c, '0.08em');
  c.fillText(SHARE_SITE, w / 2, siteMiddle);
  spaced(c, '0px');
  const rule = siteMiddle - l.site / 2 - l.gap * 1.5;
  ornament(c, w / 2, rule, l.textWidth * 0.6);
  return rule;
}

/** Kicker, medal, title, tier, player, detail (and requirement), centred between header and footer. */
function drawColumn(
  c: CanvasRenderingContext2D,
  w: number,
  top: number,
  bottom: number,
  l: CardLayout,
  card: ShareCard,
  medal: HTMLImageElement | null,
): void {
  const cx = w / 2;
  const blocks: Block[] = [];
  const measure = (font: (size: number) => string) => (text: string, size: number) => {
    c.font = font(size);
    return c.measureText(text).width;
  };
  const text = (
    value: string,
    font: (size: number) => string,
    [max, min]: [number, number],
    maxLines: number,
    color: string,
    spacing = '0px',
  ) => {
    const fitted = fitText(value, l.textWidth, max, min, maxLines, measure(font));
    const lineHeight = fitted.size * 1.2;
    blocks.push({
      height: lineHeight * fitted.lines.length,
      draw: (y) => {
        c.font = font(fitted.size);
        c.fillStyle = color;
        spaced(c, spacing);
        fitted.lines.forEach((line, i) => c.fillText(line, cx, y + lineHeight * (i + 0.5)));
        spaced(c, '0px');
      },
    });
  };

  text(card.kicker.toUpperCase(), (s) => `700 ${s}px ${HEADING}`, [l.kicker, l.kicker], 1, cssColor('--cn-pdf-iron-muted'), '0.22em');
  // The medal takes the room the texts leave (up to its full size), measured once they are laid out.
  const medalBlock: Block = {
    height: l.medal,
    draw: (y) => {
      const box = medalBlock.height;
      const glow = c.createRadialGradient(cx, y + box / 2, 0, cx, y + box / 2, box * 0.62);
      glow.addColorStop(0, cssColorAlpha('--cn-medal-glow-core', 0.28));
      glow.addColorStop(0.55, cssColorAlpha('--cn-medal-glow-edge', 0.08));
      glow.addColorStop(1, cssColorAlpha('--cn-medal-glow-edge', 0));
      c.fillStyle = glow;
      c.fillRect(cx - box, y - box * 0.2, box * 2, box * 1.4);
      if (!medal) return;
      // The flat SVG fills its box, the 3D still leaves room for the rays: draw it a little smaller.
      const side = card.medal3d ? box : box * 0.76;
      c.drawImage(medal, cx - side / 2, y + (box - side) / 2, side, side);
    },
  };
  blocks.push(medalBlock);
  text(card.title, (s) => `900 ${s}px ${DISPLAY}`, l.title, 2, cssColor('--cn-pdf-gold-text'));
  if (card.tier) {
    text(card.tier.label.toUpperCase(), (s) => `700 ${s}px ${HEADING}`, [l.tier, l.tier], 1, cssColor(`--cn-medal-${card.tier.metal}`), '0.2em');
  }
  blocks.push({ height: l.gap, draw: () => undefined });
  text(card.player, (s) => `700 ${s}px ${BODY}`, l.player, 2, cssColor('--cn-pdf-iron-text'));
  text(card.detail, (s) => `400 ${s}px ${BODY}`, [l.detail, l.detail], 1, cssColor('--cn-pdf-iron-muted'));
  if (l.description && card.description) {
    blocks.push({ height: l.gap, draw: () => undefined });
    text(card.description, (s) => `400 ${s}px ${BODY}`, [l.description, l.description], 3, cssColor('--cn-pdf-iron-text'));
  }

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Room between the rules, a gap from each.
  const room = bottom - top - l.gap * 2;
  const texts = blocks.reduce((sum, b) => sum + (b === medalBlock ? 0 : b.height), 0);
  const gaps = l.gap * (blocks.length - 1);
  medalBlock.height = Math.max(l.medal * 0.5, Math.min(l.medal, room - texts - gaps));
  const total = texts + gaps + medalBlock.height;
  let y = top + l.gap + Math.max(0, (room - total) / 2);
  for (const block of blocks) {
    block.draw(y);
    y += block.height + l.gap;
  }
}

/** A gold rule with a diamond in the middle, centred on `x`. */
function ornament(c: CanvasRenderingContext2D, x: number, y: number, width: number): void {
  const gold = cssColor('--cn-pdf-gold');
  const fade = (from: number, to: number) => {
    const gradient = c.createLinearGradient(from, y, to, y);
    gradient.addColorStop(0, cssColorAlpha('--cn-pdf-gold', 0));
    gradient.addColorStop(1, gold);
    return gradient;
  };
  c.lineWidth = 2;
  c.strokeStyle = fade(x - width / 2, x - 14);
  line(c, x - width / 2, y, x - 14, y);
  c.strokeStyle = fade(x + width / 2, x + 14);
  line(c, x + 14, y, x + width / 2, y);
  c.fillStyle = gold;
  c.beginPath();
  c.moveTo(x, y - 8);
  c.lineTo(x + 8, y);
  c.lineTo(x, y + 8);
  c.lineTo(x - 8, y);
  c.closePath();
  c.fill();
}

function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** Letter spacing where the browser supports it on canvases (older ones draw without). */
function spaced(c: CanvasRenderingContext2D, spacing: string): void {
  if ('letterSpacing' in c) c.letterSpacing = spacing;
}
