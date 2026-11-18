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
import {
  IRON_MARGIN_BOTTOM,
  IRON_MARGIN_TOP,
  IRON_MARGIN_X,
  IRON_SUBTITLE_SPACE,
  ironFooter,
  ironHeader,
  ironPage,
} from './iron-pdf';

/**
 * Builds the pdfmake document of a {@link TablePdf}: pure (no pdfmake code, no DOM), so the layout
 * can be tested. `TablePdfExporter` adds the fonts, the pictures and renders it.
 *
 * Every page is dark iron inside a double gold frame, as the site's "iron" theme (`iron-pdf.ts`),
 * and opens with the same header (crest, clan, title, subtitle, date). The facts are iron tiles, the
 * table rows iron plates under a black header row with gold titles. A group of rows can start a new
 * page, with the header row of the table again; the header row also repeats when a table runs over
 * a page. The footer carries the site, the page number and the Supercell fan content notice.
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
  /** A paragraph: its words wrap at this width, in points (one line otherwise). */
  maxWidth?: number;
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

/** Width of the coloured band on the left of grouped rows. */
const ACCENT_WIDTH = 4;
const FACTS_PER_ROW = 4;
/** Size of the body text and of the notes under it, in points. */
const TEXT_SIZE = 9;
const NOTE_SIZE = 7;

/**
 * `plate`: the brushed iron behind every page (a JPEG data URL from `PdfToolkit.ironPlate`), `null`
 * for plain dark pages.
 */
export function buildTablePdf<T>(
  pdf: TablePdf<T>,
  frame: PdfFrame,
  plate: string | null = null,
): TDocumentDefinitions {
  const { theme } = frame;
  const images = new PictureRegistry(frame);
  const plateKey = plate ? images.add('plate', plate) : null;
  const heading = { title: pdf.title, subtitle: pdf.subtitle, date: frame.generatedAt };
  const content: Content[] = [...facts(pdf.facts ?? [], theme), ...tables(pdf, frame, images)];
  if (pdf.notes) content.push(notes(pdf.notes, theme));
  return {
    pageSize: 'A4',
    pageOrientation: pdf.orientation ?? 'portrait',
    pageMargins: [
      IRON_MARGIN_X,
      IRON_MARGIN_TOP + (pdf.subtitle ? IRON_SUBTITLE_SPACE : 0),
      IRON_MARGIN_X,
      IRON_MARGIN_BOTTOM,
    ],
    info: { title: pdf.title, author: frame.brand, creator: frame.brand, subject: pdf.subtitle },
    defaultStyle: { font: 'Inter', fontSize: TEXT_SIZE, color: theme.text, lineHeight: 1.1 },
    images: images.dictionary(),
    background: (_page, size) => [
      ...ironPage(plateKey, theme, size.width, size.height),
      ...ironHeader(heading, frame, size.width),
    ],
    footer: (currentPage, pageCount, size) => ironFooter(frame, currentPage, pageCount, size.width),
    content,
  };
}

/** Names the pictures of the document (pdfmake takes them by key) and draws the special texts. */
export class PictureRegistry {
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
    const id = `text:${style.size}:${style.bold}:${style.color}:${style.maxWidth}:${text}`;
    return { image: this.add(id, drawn.dataUrl), width: drawn.width, height: drawn.height };
  }

  /** Adds a picture already made (a data URL) under its own name; returns the key to use. */
  add(id: string, dataUrl: string): string {
    let key = this.keys.get(id);
    if (!key) {
      key = `img${this.keys.size}`;
      this.keys.set(id, key);
      this.entries[key] = dataUrl;
    }
    return key;
  }

  dictionary(): Record<string, string> | undefined {
    return Object.keys(this.entries).length ? { ...this.entries } : undefined;
  }
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
        {
          text: fact.value,
          fontSize: 10,
          font: 'InterSemiBold',
          color: theme.goldText,
          margin: [0, 2, 0, 0],
        },
      ],
      fillColor: theme.plate,
    }));
    while (row.length < perRow) row.push({ text: '', fillColor: theme.plate });
    rows.push(row);
  }
  return [
    {
      table: { widths: Array<string>(perRow).fill('*'), body: rows },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => theme.edge,
        vLineColor: () => theme.edge,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 0, 0, 14],
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
          color: accent?.color ?? theme.goldText,
          fillColor: accent?.tint ?? theme.stripe,
          margin: [0, 1, 0, 0],
        },
        ...Array.from({ length: span - 1 }, () => ({})),
      ]);
    }
    group.rows.forEach((row, index) => {
      const fill = index % 2 === 1 ? theme.stripe : theme.plate;
      body.push([
        ...lead(accent?.color),
        ...pdf.columns.map((column) => toCell(column.cell(row), column.align, fill)),
      ]);
    });
  }

  if (options.empty) {
    body.push([
      ...lead(theme.plate),
      {
        text: pdf.emptyText,
        colSpan: span,
        alignment: 'center',
        color: theme.muted,
        fillColor: theme.plate,
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
        color: theme.goldText,
        margin: [0, 0, 0, 4],
      },
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 60, h: 1.5, color: theme.ember }],
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
      ...line(String(value), { size: TEXT_SIZE, bold: options.bold, color: theme.text }, images),
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
    emphasis === 'danger' ? theme.danger : emphasis === 'muted' ? theme.muted : theme.text;
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
