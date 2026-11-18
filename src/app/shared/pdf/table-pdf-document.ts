import type {
  Content,
  ContentImage,
  ContentTable,
  ContentText,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import {
  PdfAccent,
  PdfAlign,
  PdfCellValue,
  PdfFact,
  PdfNotes,
  PdfRowGroup,
  PdfTheme,
  TablePdf,
} from './table-pdf';

/**
 * Builds the pdfmake document of a {@link TablePdf}: pure (no pdfmake code, no DOM), so the layout
 * can be tested. `TablePdfExporter` adds the fonts, the pictures and renders it.
 *
 * Every page opens with the Crusade's black band (crest, clan, title, subtitle) over a gold and a
 * red rule. A group of rows can start a new page, with the header row of the table again; the
 * header row also repeats when a table runs over a page. The footer carries the site, the page
 * number and the Supercell fan content notice.
 */

/** Everything around the table that does not come from the page: identity, texts, colours. */
export interface PdfFrame {
  /** Clan name, e.g. `Crociata Nera`. */
  brand: string;
  clanTag: string;
  /** Host name shown in the footer. */
  site: string;
  /** Already translated, e.g. `Generato il 18 nov 2026, 12:30`. */
  generatedAt: string;
  /** `Pagina 1 di 2`. */
  page(current: number, total: number): string;
  /** Supercell fan content notice, plain text. */
  fanContent: string;
  /** The crest as a PNG/JPEG data URL; `null` leaves its place empty. */
  crest: string | null;
  /** The pictures of the image cells, already loaded: URL → PNG data URL. */
  images: Readonly<Record<string, string>>;
  /**
   * Draws a text the fonts of the PDF cannot (see {@link needsTextImage}) as a picture; `null`
   * writes it with the PDF fonts anyway.
   */
  textImage(text: string, style: PdfTextStyle): PdfTextImage | null;
  theme: PdfTheme;
}

/** How a text drawn as a picture looks: points, weight and colour (hex). */
export interface PdfTextStyle {
  size: number;
  bold: boolean;
  color: string;
}

/** A text drawn as a picture: PNG data URL and its size in points. */
export interface PdfTextImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Font families of the document; `TablePdfExporter` maps each file to its URL. */
export const PDF_FONTS = {
  Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' },
  InterSemiBold: { normal: 'Inter-SemiBold.ttf', bold: 'Inter-Bold.ttf' },
  Cinzel: { normal: 'Cinzel-Bold.ttf', bold: 'Cinzel-Bold.ttf' },
  CinzelDecorative: { normal: 'CinzelDecorative-Black.ttf', bold: 'CinzelDecorative-Black.ttf' },
} as const;

/**
 * Characters Inter draws: Latin, Greek, Cyrillic, punctuation, arrows and simple symbols (☆, ★).
 * Pictographs (emoji, ⚡), variation selectors and other scripts are drawn by the browser instead.
 */
const PDF_FONT_TEXT = /^[\u0000-\u052F\u1E00-\u1FFF\u2000-\u2BFF]*$/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** Whether a text has characters the fonts of the PDF cannot draw (emoji, other scripts). */
export function needsTextImage(text: string): boolean {
  return !PDF_FONT_TEXT.test(text) || PICTOGRAPH.test(text);
}

/** Every picture of the table's image cells, to load before building (`frame.images`). */
export function pdfImageUrls<T>(pdf: TablePdf<T>): string[] {
  const urls = new Set<string>();
  for (const group of pdf.groups) {
    for (const row of group.rows) {
      for (const column of pdf.columns) {
        const value = column.cell(row);
        if (typeof value === 'object' && 'image' in value && value.image) urls.add(value.image);
      }
    }
  }
  return [...urls];
}

/** Page geometry, in points (A4: 595 × 842). */
const MARGIN_X = 36;
const MARGIN_BOTTOM = 58;
/** Height of the band at the top of every page. */
const BAND_HEIGHT = 96;
/** Content starts under the band and its two rules. */
const MARGIN_TOP = BAND_HEIGHT + 4 + 18;
const CREST_SIZE = 64;
/** Width of the coloured band on the left of grouped rows. */
const ACCENT_WIDTH = 4;
const FACTS_PER_ROW = 4;
/** Size of the body text and of the notes under it, in points. */
const TEXT_SIZE = 9;
const NOTE_SIZE = 7;

export function buildTablePdf<T>(pdf: TablePdf<T>, frame: PdfFrame): TDocumentDefinitions {
  const { theme } = frame;
  const images = new PictureRegistry(frame);
  const content: Content[] = [...facts(pdf.facts ?? [], theme), ...tables(pdf, frame, images)];
  if (pdf.notes) content.push(notes(pdf.notes, theme));
  return {
    pageSize: 'A4',
    pageOrientation: pdf.orientation ?? 'portrait',
    pageMargins: [MARGIN_X, MARGIN_TOP, MARGIN_X, MARGIN_BOTTOM],
    info: { title: pdf.title, author: frame.brand, creator: frame.brand, subject: pdf.subtitle },
    defaultStyle: { font: 'Inter', fontSize: TEXT_SIZE, color: theme.ink, lineHeight: 1.1 },
    images: images.dictionary(),
    background: (_page, pageSize) => background(pdf, frame, pageSize.width, pageSize.height),
    footer: (currentPage, pageCount, pageSize) =>
      footer(frame, currentPage, pageCount, pageSize.width),
    content,
  };
}

/** Names the pictures of the document (pdfmake takes them by key) and draws the special texts. */
class PictureRegistry {
  private readonly entries: Record<string, string> = {};
  private readonly keys = new Map<string, string>();

  constructor(private readonly frame: PdfFrame) {
    if (frame.crest) this.entries['crest'] = frame.crest;
  }

  /** Key of a loaded picture of an image cell; `null` when it could not be loaded. */
  picture(url: string): string | null {
    const dataUrl = this.frame.images[url];
    return dataUrl ? this.add(`url:${url}`, dataUrl) : null;
  }

  /** A text with emoji or other scripts as a picture; `null` when it can be written. */
  text(text: string, style: PdfTextStyle): { image: string; width: number; height: number } | null {
    if (!needsTextImage(text)) return null;
    const drawn = this.frame.textImage(text, style);
    if (!drawn) return null;
    const id = `text:${style.size}:${style.bold}:${style.color}:${text}`;
    return { image: this.add(id, drawn.dataUrl), width: drawn.width, height: drawn.height };
  }

  dictionary(): Record<string, string> | undefined {
    return Object.keys(this.entries).length ? { ...this.entries } : undefined;
  }

  private add(id: string, dataUrl: string): string {
    let key = this.keys.get(id);
    if (!key) {
      key = `img${this.keys.size}`;
      this.keys.set(id, key);
      this.entries[key] = dataUrl;
    }
    return key;
  }
}

/** Paper, band, crest and titles: the same on every page. */
function background(
  pdf: TablePdf<unknown>,
  frame: PdfFrame,
  width: number,
  height: number,
): Content {
  const { theme } = frame;
  const textX = MARGIN_X + CREST_SIZE + 16;
  return [
    {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: width, h: height, color: theme.paper },
        { type: 'rect', x: 0, y: 0, w: width, h: BAND_HEIGHT, color: theme.band },
        { type: 'rect', x: 0, y: BAND_HEIGHT, w: width, h: 2.5, color: theme.gold },
        { type: 'rect', x: 0, y: BAND_HEIGHT + 2.5, w: width, h: 1.5, color: theme.red },
      ],
      absolutePosition: { x: 0, y: 0 },
    },
    frame.crest
      ? {
          image: 'crest',
          fit: [CREST_SIZE, CREST_SIZE],
          absolutePosition: { x: MARGIN_X, y: (BAND_HEIGHT - CREST_SIZE) / 2 },
        }
      : '',
    {
      columns: [
        {
          width: width - textX - MARGIN_X,
          stack: [
            {
              text: [
                { text: frame.brand.toUpperCase(), font: 'CinzelDecorative' },
                { text: `   ${frame.clanTag}`, font: 'InterSemiBold', fontSize: 7.5 },
              ],
              fontSize: 10,
              color: theme.goldText,
              characterSpacing: 0.6,
            },
            {
              text: pdf.title,
              font: 'Cinzel',
              fontSize: 22,
              color: theme.bandText,
              margin: [0, 3, 0, 2],
            },
            pdf.subtitle
              ? { text: pdf.subtitle, fontSize: 8.5, color: theme.bandMuted, lineHeight: 1.2 }
              : '',
          ],
        },
      ],
      absolutePosition: { x: textX, y: 19 },
    },
    {
      // A column as wide as the content area: the date sits against the right margin.
      columns: [
        {
          width: width - MARGIN_X * 2,
          text: frame.generatedAt,
          fontSize: 7,
          color: theme.bandMuted,
          alignment: 'right',
        },
      ],
      absolutePosition: { x: MARGIN_X, y: 10 },
    },
  ];
}

function footer(frame: PdfFrame, currentPage: number, pageCount: number, width: number): Content {
  const { theme } = frame;
  return {
    margin: [MARGIN_X, 16, MARGIN_X, 0],
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: width - MARGIN_X * 2,
            y2: 0,
            lineWidth: 0.5,
            lineColor: theme.gold,
          },
        ],
      },
      {
        margin: [0, 6, 0, 0],
        columns: [
          { width: '*', text: frame.fanContent, fontSize: 6.5, color: theme.muted },
          {
            width: 'auto',
            text: `${frame.site}  ·  ${frame.page(currentPage, pageCount)}`,
            fontSize: 7,
            color: theme.muted,
            alignment: 'right',
            noWrap: true,
            margin: [12, 0, 0, 0],
          },
        ],
      },
    ],
  };
}

/** The facts as tiles, at most {@link FACTS_PER_ROW} per row. */
function facts(list: readonly PdfFact[], theme: PdfTheme): Content[] {
  if (list.length === 0) return [];
  const perRow = Math.min(FACTS_PER_ROW, list.length);
  const rows: TableCell[][] = [];
  for (let i = 0; i < list.length; i += perRow) {
    const row: TableCell[] = list.slice(i, i + perRow).map((fact) => ({
      stack: [
        {
          text: fact.label.toUpperCase(),
          fontSize: 6.5,
          color: theme.muted,
          characterSpacing: 0.5,
          font: 'InterSemiBold',
        },
        { text: fact.value, fontSize: 10, font: 'InterSemiBold', margin: [0, 2, 0, 0] },
      ],
      fillColor: theme.stripe,
    }));
    while (row.length < perRow) row.push({ text: '', fillColor: theme.stripe });
    rows.push(row);
  }
  return [
    {
      table: { widths: Array<string>(perRow).fill('*'), body: rows },
      layout: {
        hLineWidth: () => 2,
        vLineWidth: () => 2,
        hLineColor: () => theme.paper,
        vLineColor: () => theme.paper,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [-2, 0, -2, 14],
    },
  ];
}

/**
 * The table: one per run of groups, a group with `pageBreakBefore` starting a new page (and table,
 * so its header row comes back). The totals close the last one.
 */
function tables<T>(pdf: TablePdf<T>, frame: PdfFrame, images: PictureRegistry): ContentTable[] {
  const runs: PdfRowGroup<T>[][] = [];
  for (const group of pdf.groups) {
    if (runs.length === 0 || group.pageBreakBefore) runs.push([]);
    runs.at(-1)!.push(group);
  }
  if (runs.length === 0) runs.push([]);
  const empty = pdf.groups.every((group) => group.rows.length === 0);
  return runs.map((groups, i) => {
    const last = i === runs.length - 1;
    const content = table(pdf, groups, frame, images, {
      empty: empty && last,
      footer: last ? pdf.footer : undefined,
    });
    return i > 0 ? { ...content, pageBreak: 'before' } : content;
  });
}

function table<T>(
  pdf: TablePdf<T>,
  groups: readonly PdfRowGroup<T>[],
  frame: PdfFrame,
  images: PictureRegistry,
  options: { empty: boolean; footer: readonly PdfCellValue[] | undefined },
): ContentTable {
  const { theme } = frame;
  const accented = pdf.groups.some((group) => group.accent);
  const span = pdf.columns.length;
  const lead = (fill?: string): TableCell[] => (accented ? [{ text: '', fillColor: fill }] : []);
  const toCell = (value: PdfCellValue, align: PdfAlign | undefined, fill?: string, bold = false) =>
    cell(value, { align, fill, bold, theme, images });

  const body: TableCell[][] = [
    [
      ...lead(theme.band),
      ...pdf.columns.map<TableCell>((column) => ({
        text: column.header.toUpperCase(),
        font: 'Cinzel',
        fontSize: 7.5,
        color: theme.goldText,
        fillColor: theme.band,
        alignment: column.align ?? 'left',
        verticalAlignment: 'middle',
        noWrap: true,
        characterSpacing: 0.3,
      })),
    ],
  ];

  for (const group of groups) {
    const accent = group.accent ? accentColors(group.accent, theme) : null;
    if (group.title) {
      body.push([
        ...lead(accent?.color),
        {
          text: group.title,
          colSpan: span,
          font: 'Cinzel',
          fontSize: 9.5,
          color: accent?.color ?? theme.red,
          fillColor: accent?.tint ?? theme.stripe,
          margin: [0, 1, 0, 0],
        },
        ...Array.from({ length: span - 1 }, () => ({})),
      ]);
    }
    group.rows.forEach((row, index) => {
      const fill = index % 2 === 1 ? theme.stripe : undefined;
      body.push([
        ...lead(accent?.color),
        ...pdf.columns.map((column) => toCell(column.cell(row), column.align, fill)),
      ]);
    });
  }

  if (options.empty) {
    body.push([
      ...lead(),
      {
        text: pdf.emptyText,
        colSpan: span,
        alignment: 'center',
        color: theme.muted,
        margin: [0, 10, 0, 10],
      },
      ...Array.from({ length: span - 1 }, () => ({})),
    ]);
  }

  const footer = options.footer;
  if (footer) {
    body.push([
      ...lead(theme.stripe),
      ...pdf.columns.map((column, i) => toCell(footer[i] ?? '', column.align, theme.stripe, true)),
    ]);
  }

  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [...(accented ? [ACCENT_WIDTH] : []), ...pdf.columns.map((c) => c.width ?? '*')],
      body,
    },
    layout: tableLayout(theme, accented, !!footer),
  };
}

/** The notes as a titled list, on a page of their own if asked. */
function notes(list: PdfNotes, theme: PdfTheme): Content {
  return {
    stack: [
      {
        text: list.title,
        font: 'Cinzel',
        fontSize: 15,
        color: theme.red,
        margin: [0, 0, 0, 4],
      },
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 60, h: 1.5, color: theme.gold }],
        margin: [0, 0, 0, 12],
      },
      {
        ul: [...list.items],
        fontSize: 9.5,
        lineHeight: 1.3,
        markerColor: theme.gold,
      },
    ],
    pageBreak: list.pageBreakBefore ? 'before' : undefined,
    margin: [0, list.pageBreakBefore ? 0 : 18, 0, 0],
  };
}

function tableLayout(theme: PdfTheme, accented: boolean, hasFooter: boolean): CustomTableLayout {
  const strong = (i: number, rows: number) =>
    i === 1 || i === rows || (hasFooter && i === rows - 1);
  return {
    hLineWidth: (i, node) => {
      const rows = node.table.body.length;
      if (i === 0) return 0;
      return strong(i, rows) ? 1.2 : 0.5;
    },
    hLineColor: (i, node) => (strong(i, node.table.body.length) ? theme.gold : theme.line),
    vLineWidth: () => 0,
    paddingLeft: (i) => (accented && i === 0 ? 0 : 6),
    paddingRight: (i) => (accented && i === 0 ? 0 : 6),
    paddingTop: () => 2.5,
    paddingBottom: () => 2.5,
  };
}

interface CellOptions {
  align: PdfAlign | undefined;
  fill: string | undefined;
  bold: boolean;
  theme: PdfTheme;
  images: PictureRegistry;
}

/** A body cell, its content in the middle of the row's height (rows grow with notes and pictures). */
function cell(value: PdfCellValue, options: CellOptions): TableCell {
  return { ...(cellContent(value, options) as object), verticalAlignment: 'middle' } as TableCell;
}

function cellContent(value: PdfCellValue, options: CellOptions): TableCell {
  const { theme, images, fill } = options;
  const alignment = options.align ?? 'left';
  if (typeof value !== 'object') {
    return {
      ...line(String(value), { size: TEXT_SIZE, bold: options.bold, color: theme.ink }, images),
      alignment,
      fillColor: fill,
    };
  }
  if ('image' in value) {
    const key = value.image ? images.picture(value.image) : null;
    if (!key) return { text: value.fallback ?? '', alignment, fillColor: fill, color: theme.muted };
    return { image: key, fit: [value.size, value.size], alignment, fillColor: fill };
  }
  const emphasis = value.emphasis;
  const bold = options.bold || emphasis === 'strong' || emphasis === 'danger';
  const color =
    emphasis === 'danger' ? theme.danger : emphasis === 'muted' ? theme.muted : theme.ink;
  const main = { ...line(value.text, { size: TEXT_SIZE, bold, color }, images), alignment };
  if (!value.note) return { ...main, fillColor: fill } as TableCell;
  const note = line(value.note, { size: NOTE_SIZE, bold: false, color: theme.muted }, images);
  return { stack: [main, { ...note, alignment }], fillColor: fill } as TableCell;
}

/** A line of text: written with the PDF fonts, or drawn as a picture when they cannot. */
function line(
  text: string,
  style: PdfTextStyle,
  images: PictureRegistry,
): ContentText | ContentImage {
  const picture = images.text(text, style);
  if (picture) return picture;
  return { text, fontSize: style.size, bold: style.bold, color: style.color };
}

function accentColors(accent: PdfAccent, theme: PdfTheme): { color: string; tint: string } {
  return accent === 'starter'
    ? { color: theme.starter, tint: theme.starterTint }
    : { color: theme.reserve, tint: theme.reserveTint };
}
