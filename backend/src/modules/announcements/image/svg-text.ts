import * as opentype from 'opentype.js';
import { readSiteAsset } from '@/lib/assets/site-assets';

/**
 * Text of the announcement pictures, drawn as SVG paths: the server has no system fonts (Alpine
 * image), so the fonts of the PDFs (`public/assets/fonts/pdf/`) are read here and every text becomes
 * the outline of its letters. Characters a font lacks (emoji, other scripts) are left out.
 */

export type FontName = 'display' | 'title' | 'regular' | 'semibold' | 'bold';

const FONT_FILES: Record<FontName, string> = {
  display: 'assets/fonts/pdf/CinzelDecorative-Black.ttf',
  title: 'assets/fonts/pdf/Cinzel-Bold.ttf',
  regular: 'assets/fonts/pdf/Inter-Regular.ttf',
  semibold: 'assets/fonts/pdf/Inter-SemiBold.ttf',
  bold: 'assets/fonts/pdf/Inter-Bold.ttf',
};

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
  private constructor(private readonly fonts: Record<FontName, opentype.Font>) {}

  static async create(): Promise<SvgText> {
    return new SvgText(await loadFonts());
  }

  /** The text without the characters the font cannot draw, spaces collapsed. */
  clean(text: string, font: FontName): string {
    const face = this.fonts[font];
    return Array.from(text)
      .filter((char) => /\s/.test(char) || face.charToGlyphIndex(char) > 0)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  width(text: string, font: FontName, size: number): number {
    return this.measure(this.clean(text, font), font, size);
  }

  /**
   * Glyphs are placed one by one, with the kerning pairs: opentype.js's own text layout applies
   * substitution features it does not fully support (it throws on Inter's).
   */
  private layout(text: string, font: FontName, size: number): { glyph: opentype.Glyph; x: number }[] {
    const face = this.fonts[font];
    const scale = size / face.unitsPerEm;
    const placed: { glyph: opentype.Glyph; x: number }[] = [];
    let x = 0;
    let previous: opentype.Glyph | null = null;
    for (const char of Array.from(text)) {
      const glyph = face.charToGlyph(char);
      if (previous) x += kerning(face, previous, glyph) * scale;
      placed.push({ glyph, x });
      x += (glyph.advanceWidth ?? 0) * scale;
      previous = glyph;
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

  /** `<path>` of a text. */
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
    let left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    let baseline = y;
    if (options.centered) {
      const box = inkBox(placed.slice(0, -1).map(({ glyph, x: offset }) => glyph.getPath(offset, 0, size)));
      if (box) {
        left = x - (box.x1 + box.x2) / 2;
        baseline = y - (box.y1 + box.y2) / 2;
      }
    }
    const d = placed
      .slice(0, -1)
      .map(({ glyph, x: offset }) => pathData(glyph.getPath(left + offset, baseline, size)))
      .join('');
    const opacity = options.opacity !== undefined ? ` fill-opacity="${options.opacity}"` : '';
    return `<path d="${d}" fill="${fill}"${opacity}/>`;
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

  private truncate(text: string, font: FontName, size: number, maxWidth: number): string {
    if (this.measure(text, font, size) <= maxWidth) return text;
    const chars = Array.from(text);
    while (chars.length > 1 && this.measure(`${chars.join('').trimEnd()}…`, font, size) > maxWidth) chars.pop();
    return `${chars.join('').trimEnd()}…`;
  }
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

/** Bounding box of the outlines of some glyphs; `null` when they draw nothing. */
function inkBox(paths: opentype.Path[]): { x1: number; y1: number; x2: number; y2: number } | null {
  let box: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const path of paths) {
    if (!path.commands.length) continue;
    const b = path.getBoundingBox();
    box = box
      ? { x1: Math.min(box.x1, b.x1), y1: Math.min(box.y1, b.y1), x2: Math.max(box.x2, b.x2), y2: Math.max(box.y2, b.y2) }
      : { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
  }
  return box;
}
