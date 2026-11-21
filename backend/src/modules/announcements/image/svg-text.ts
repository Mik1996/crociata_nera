import * as opentype from 'opentype.js';
import sharp from 'sharp';
import { readSiteAsset, siteAssetPath } from '@/lib/assets/site-assets';

/**
 * Text of the announcement pictures, drawn as SVG paths: the fonts of the PDFs
 * (`public/assets/fonts/pdf/`) are read here and every text becomes the outline of its letters, the
 * same on every machine.
 *
 * Players' names also hold what these fonts lack: emoji (⚡️NICO⚡️), other scripts (ハーレイ), modifier
 * letters (gioᴰ·ᴶ). Those pieces are drawn by Pango (`sharp`'s text) with the system's fonts (Noto,
 * installed in the Docker image) as pictures: emoji in their colours, the rest painted with the
 * colour of the text. They must be prepared ({@link SvgText.prepare}, asynchronous) before the
 * drawing; pieces never prepared are left out.
 */

export type FontName = 'display' | 'title' | 'regular' | 'semibold' | 'bold';

const FONT_FILES: Record<FontName, string> = {
  display: 'assets/fonts/pdf/CinzelDecorative-Black.ttf',
  title: 'assets/fonts/pdf/Cinzel-Bold.ttf',
  regular: 'assets/fonts/pdf/Inter-Regular.ttf',
  semibold: 'assets/fonts/pdf/Inter-SemiBold.ttf',
  bold: 'assets/fonts/pdf/Inter-Bold.ttf',
};

/** Pango description of each font (the family and weight inside the file). */
const PANGO_FONTS: Record<FontName, string> = {
  display: 'Cinzel Decorative Black',
  title: 'Cinzel Bold',
  regular: 'Inter',
  semibold: 'Inter SemiBold',
  bold: 'Inter Bold',
};

/** Size (px) pieces are drawn at by Pango; scaled down in the picture. */
const PIECE_SIZE = 160;
/** Room on each side of a piece, as a share of the size of the text. */
const PIECE_SPACING = 0.05;
/** Height of the ink of emoji, as a share of the size of the text (a little taller than the capitals). */
const EMOJI_HEIGHT = 0.8;

/** A piece of text drawn by Pango: its ink, cropped, as a PNG. */
interface Piece {
  href: string;
  /** Size of the ink at {@link PIECE_SIZE}. */
  width: number;
  height: number;
  /** Emoji keep their colours; other pieces take the colour of the text. */
  emoji: boolean;
}

/** A glyph of the font or a piece drawn by Pango, at its place on the line. */
type Placed = { glyph: opentype.Glyph; piece?: undefined; x: number } | { piece: Piece; glyph?: undefined; x: number };

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}|\u{20E3}/u;

let fonts: Promise<Record<FontName, opentype.Font>> | null = null;

function loadFonts(): Promise<Record<FontName, opentype.Font>> {
  fonts ??= Promise.all(
    (Object.entries(FONT_FILES) as [FontName, string][]).map(async ([name, file]) => {
      const data = await readSiteAsset(file);
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      return [name, opentype.parse(buffer)] as const;
    }),
  ).then(Object.fromEntries as (entries: (readonly [FontName, opentype.Font])[]) => Record<FontName, opentype.Font>);
  // A failure (file missing) is tried again next time.
  fonts.catch(() => (fonts = null));
  return fonts;
}

export interface TextOptions {
  font: FontName;
  /** Size in pixels. */
  size: number;
  x: number;
  /** Baseline. */
  y: number;
  fill: string;
  anchor?: 'start' | 'middle' | 'end';
  /**
   * `true`: (`x`, `y`) is the centre of the ink of the text (its outline), not the baseline: the
   * text sits in the middle of a shape whatever its size (it shrinks to fit) and its glyphs.
   */
  centered?: boolean;
  /** The text shrinks to fit this width, down to `minSize`, then is cut with "…". */
  maxWidth?: number;
  minSize?: number;
  opacity?: number;
}

/** Measures and draws texts with the fonts of the pictures. */
export class SvgText {
  /** Pieces drawn by Pango, by font and text (`null`: Pango could not draw it). */
  private readonly pieces = new Map<string, Piece | null>();

  private constructor(private readonly fonts: Record<FontName, opentype.Font>) {}

  static async create(): Promise<SvgText> {
    return new SvgText(await loadFonts());
  }

  /**
   * Draws ahead the pieces of these texts the fonts cannot draw (emoji, other scripts), in every
   * font: the texts of an announcement (players' and clans' names) may be drawn in any of them.
   */
  async prepare(texts: Iterable<string>): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const raw of new Set(texts)) {
      for (const font of Object.keys(FONT_FILES) as FontName[]) {
        for (const run of this.runs(normalize(raw), font)) {
          const key = `${font}\u0000${run.text}`;
          if (run.drawable || this.pieces.has(key)) continue;
          this.pieces.set(key, null);
          jobs.push(
            drawPiece(run.text, font, run.emoji).then(
              (piece) => void this.pieces.set(key, piece),
              () => undefined,
            ),
          );
        }
      }
    }
    await Promise.all(jobs);
  }

  /** The text without what cannot be drawn (characters neither in the font nor prepared), spaces collapsed. */
  clean(text: string, font: FontName): string {
    return this.runs(normalize(text), font)
      .filter((run) => run.drawable || this.piece(run.text, font))
      .map((run) => run.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  width(text: string, font: FontName, size: number): number {
    return this.measure(this.clean(text, font), font, size);
  }

  /**
   * Splits a text into runs of characters (graphemes) the font draws and runs it cannot (emoji apart
   * from the rest: they keep their colours).
   */
  private runs(text: string, font: FontName): { text: string; drawable: boolean; emoji: boolean }[] {
    const face = this.fonts[font];
    const runs: { text: string; drawable: boolean; emoji: boolean }[] = [];
    for (const { segment } of graphemes.segment(text)) {
      const chars = Array.from(segment);
      const emoji = EMOJI.test(segment) && (chars.length > 1 || !face.charToGlyphIndex(segment));
      const drawable = !emoji && chars.every((char) => /\s/.test(char) || face.charToGlyphIndex(char) > 0);
      const last = runs.at(-1);
      if (last && last.drawable === drawable && last.emoji === emoji) last.text += segment;
      else runs.push({ text: segment, drawable, emoji });
    }
    return runs;
  }

  private piece(text: string, font: FontName): Piece | null {
    return this.pieces.get(`${font}\u0000${text}`) ?? null;
  }

  /**
   * Glyphs are placed one by one, with the kerning pairs: opentype.js's own text layout applies
   * substitution features it does not fully support (it throws on Inter's). Pieces drawn by Pango
   * take their own width, with a little room on each side.
   */
  private layout(text: string, font: FontName, size: number): Placed[] {
    const face = this.fonts[font];
    const scale = size / face.unitsPerEm;
    const placed: Placed[] = [];
    let x = 0;
    let previous: opentype.Glyph | null = null;
    for (const run of this.runs(text, font)) {
      if (!run.drawable) {
        const piece = this.piece(run.text, font);
        if (!piece) continue;
        x += size * PIECE_SPACING;
        placed.push({ piece, x });
        x += piece.width * pieceScale(piece, size) + size * PIECE_SPACING;
        previous = null;
        continue;
      }
      for (const char of Array.from(run.text)) {
        const glyph = face.charToGlyph(char);
        if (previous) x += kerning(face, previous, glyph) * scale;
        placed.push({ glyph, x });
        x += (glyph.advanceWidth ?? 0) * scale;
        previous = glyph;
      }
    }
    placed.push({ glyph: face.glyphs.get(0), x });
    return placed;
  }

  private measure(text: string, font: FontName, size: number): number {
    return this.layout(text, font, size).at(-1)?.x ?? 0;
  }

  /** Largest size up to `size` (down to `minSize`) at which the text fits `maxWidth`. */
  fitSize(text: string, font: FontName, size: number, maxWidth: number, minSize = size): number {
    const width = this.width(text, font, size);
    if (width <= maxWidth) return size;
    return Math.max(minSize, Math.floor((size * maxWidth) / width));
  }

  /** `<path>` of a text, with the `<image>`s of its pieces drawn by Pango. */
  draw(text: string, options: TextOptions): string {
    const { font, x, y, fill, anchor = 'start' } = options;
    let content = this.clean(text, font);
    let size = options.size;
    if (options.maxWidth !== undefined) {
      size = this.fitSize(content, font, size, options.maxWidth, options.minSize ?? size);
      content = this.truncate(content, font, size, options.maxWidth);
    }
    if (!content) return '';
    const placed = this.layout(content, font, size);
    const width = placed.at(-1)?.x ?? 0;
    const items = placed.slice(0, -1);
    const capHeight = (this.fonts[font].tables.os2?.sCapHeight ?? this.fonts[font].unitsPerEm * 0.7) / this.fonts[font].unitsPerEm;
    // A piece's ink is centred on the middle of the capital letters.
    const pieceBox = (piece: Piece, offset: number, baseline: number) => {
      const scale = pieceScale(piece, size);
      const height = piece.height * scale;
      return { x: offset, y: baseline - (capHeight * size) / 2 - height / 2, width: piece.width * scale, height };
    };
    let left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    let baseline = y;
    if (options.centered) {
      const box = inkBox(
        items.map((item) => {
          if (item.glyph) return item.glyph.getPath(item.x, 0, size).getBoundingBox();
          const b = pieceBox(item.piece, item.x, 0);
          return { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height };
        }),
      );
      if (box) {
        left = x - (box.x1 + box.x2) / 2;
        baseline = y - (box.y1 + box.y2) / 2;
      }
    }
    const d = items
      .map((item) => (item.glyph ? pathData(item.glyph.getPath(left + item.x, baseline, size)) : ''))
      .join('');
    const opacity = options.opacity !== undefined ? ` fill-opacity="${options.opacity}"` : '';
    const images = items
      .filter((item) => item.piece)
      .map((item) => {
        const piece = item.piece!;
        const b = pieceBox(piece, left + item.x, baseline);
        const tint = piece.emoji ? '' : ` filter="url(#${tintFilterId(fill)})"`;
        const imageOpacity = options.opacity !== undefined ? ` opacity="${options.opacity}"` : '';
        return `<image href="${piece.href}" x="${num(b.x)}" y="${num(b.y)}" width="${num(b.width)}" height="${num(b.height)}"${tint}${imageOpacity}/>`;
      });
    const filters = items.some((item) => item.piece && !item.piece.emoji) ? tintFilter(fill) : '';
    return `${d ? `<path d="${d}" fill="${fill}"${opacity}/>` : ''}${filters}${images.join('')}`;
  }

  /**
   * Splits items (names) into lines no wider than `maxWidth`, joined by `separator`. An item wider
   * than a line is cut with "…".
   */
  wrap(items: string[], font: FontName, size: number, maxWidth: number, separator = ' · '): string[] {
    const lines: string[] = [];
    let line = '';
    for (const raw of items) {
      const item = this.truncate(this.clean(raw, font), font, size, maxWidth);
      if (!item) continue;
      const candidate = line ? `${line}${separator}${item}` : item;
      if (!line || this.width(candidate, font, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = item;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Cuts a text to `maxWidth` with "…", a grapheme at a time (a piece drawn by Pango is cut whole). */
  private truncate(text: string, font: FontName, size: number, maxWidth: number): string {
    if (this.measure(text, font, size) <= maxWidth) return text;
    const runs = this.runs(text, font).flatMap((run) =>
      run.drawable ? Array.from(graphemes.segment(run.text), (g) => g.segment) : [run.text],
    );
    while (runs.length > 1 && this.measure(`${runs.join('').trimEnd()}…`, font, size) > maxWidth) runs.pop();
    return `${runs.join('').trimEnd()}…`;
  }
}

/**
 * Scale of a piece in a text of this size. Emoji are brought to one height (the system's are taller
 * than the capitals, and each its own height); other scripts keep the size Pango drew them at.
 */
function pieceScale(piece: Piece, size: number): number {
  if (!piece.emoji) return size / PIECE_SIZE;
  return Math.min(size / PIECE_SIZE, (EMOJI_HEIGHT * size) / Math.max(piece.height, 1));
}

/** NFC, so accented letters typed as two characters match the font's single glyph. */
function normalize(text: string): string {
  return text.normalize('NFC');
}

/**
 * Draws a piece with Pango: white text (painted later with the colour of the text) or emoji in their
 * colours, cropped to its ink.
 */
async function drawPiece(text: string, font: FontName, emoji: boolean): Promise<Piece | null> {
  // An emoji written without its selector (☠) is drawn as an emoji, not as a black symbol.
  const content = emoji ? Array.from(text, (char) => (/\p{Extended_Pictographic}/u.test(char) ? `${char}\u{FE0F}` : char)).join('').replace(/\u{FE0F}+/gu, '\u{FE0F}') : text;
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="#ffffff">${escapeMarkup(content)}</span>`,
      font: `${PANGO_FONTS[font]} ${PIECE_SIZE}`,
      fontfile: siteAssetPath(FONT_FILES[font]),
      rgba: true,
      dpi: 72,
    },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const box = alphaBox(data, info.width, info.height, info.channels);
  if (!box) return null;
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .png()
    .toBuffer();
  return { href: `data:image/png;base64,${png.toString('base64')}`, width: box.width, height: box.height, emoji };
}

/** Smallest box holding the visible pixels of a raw RGBA picture; `null` when it is empty. */
function alphaBox(data: Buffer, width: number, height: number, channels: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * channels + channels - 1] ?? 0) > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const tintFilterId = (fill: string) => `tint-${fill.replace(/[^a-zA-Z0-9]/g, '')}`;

/** Filter painting a white piece with the colour of the text (its shape from the piece's alpha). */
function tintFilter(fill: string): string {
  return `<defs><filter id="${tintFilterId(fill)}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood flood-color="${fill}"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>`;
}

/** Kerning between two glyphs (font units); 0 when the font has none or cannot tell. */
function kerning(face: opentype.Font, left: opentype.Glyph, right: opentype.Glyph): number {
  try {
    return face.getKerningValue(left, right) || 0;
  } catch {
    return 0;
  }
}

const num = (value: number) => String(Math.round(value * 10) / 10);

/** SVG path data of a glyph (opentype.js's own `toPathData` writes `NaN` for some numbers). */
function pathData(path: opentype.Path): string {
  return path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${num(c.x)} ${num(c.y)}`;
        case 'Q':
          return `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
        case 'C':
          return `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

/** Box around some boxes (glyph outlines, pieces); `null` when there are none with ink. */
function inkBox(boxes: { x1: number; y1: number; x2: number; y2: number }[]): { x1: number; y1: number; x2: number; y2: number } | null {
  let box: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const b of boxes) {
    // An empty outline (a space) has an infinite box.
    if (!Number.isFinite(b.x1) || !Number.isFinite(b.y1) || (b.x1 === b.x2 && b.y1 === b.y2)) continue;
    box = box
      ? { x1: Math.min(box.x1, b.x1), y1: Math.min(box.y1, b.y1), x2: Math.max(box.x2, b.x2), y2: Math.max(box.y2, b.y2) }
      : { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
  }
  return box;
}
