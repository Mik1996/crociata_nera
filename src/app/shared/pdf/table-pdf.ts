import { cssColor } from '../styles/css-color';

/**
 * A table to export as a PDF in the Crusade's iron look (`TablePdfExporter`): the same header on
 * every page (crest, clan, title), a row of facts, then the table, whose rows can be split in coloured
 * groups (CWL starters and reserves, each on its own page if asked) and closed by a totals row, and
 * an optional page of notes (the rules). Pages describe their table with this type; the layout,
 * fonts and colours belong to `shared/pdf`.
 */
export interface TablePdf<T> {
  /** File name without extension, e.g. `crociata-nera-raid-2026-11-14`. */
  fileName: string;
  /** Title of the document and of the page headers (unless a group or the notes have a `pageTitle`). */
  title: string;
  subtitle?: string;
  /** Label/value pairs shown in a row under the header (season, totals...). */
  facts?: readonly PdfFact[];
  columns: readonly PdfColumn<T>[];
  /** Groups of rows, in order; a group with a `title` gets a heading row. */
  groups: readonly PdfRowGroup<T>[];
  /** Last row (totals), one value per column. */
  footer?: readonly PdfCellValue[];
  /** Shown in the table when every group is empty. */
  emptyText: string;
  /** A titled list after the table (rules, explanations). */
  notes?: PdfNotes;
  /** Portrait by default; landscape for wide tables. */
  orientation?: 'portrait' | 'landscape';
}

export interface PdfNotes {
  title: string;
  items: readonly string[];
  /** Starts a new page. */
  pageBreakBefore?: boolean;
  /** Title in the header of the page of the notes (with `pageBreakBefore`); `title` of the PDF otherwise. */
  pageTitle?: string;
}

export interface PdfFact {
  label: string;
  value: string;
}

export type PdfAlign = 'left' | 'center' | 'right';

export interface PdfColumn<T> {
  header: string;
  /** Method syntax on purpose: a `TablePdf<Row>` is accepted where a `TablePdf<unknown>` is. */
  cell(row: T): PdfCellValue;
  align?: PdfAlign;
  /** Points, `auto` (fits the content) or `*` (shares the free width, the default). */
  width?: number | 'auto' | '*';
}

/**
 * A cell: plain text, text with a smaller note under it and an emphasis, or a picture. Text the
 * fonts of the PDF cannot draw (emoji, other scripts) is drawn by the browser as a picture.
 */
export type PdfCellValue = string | number | PdfCell | PdfImageCell;

export interface PdfImageCell {
  /** URL of the picture, relative to the site (`game/town-halls/th-17.webp`); any image format. */
  image: string | null;
  /** Side of the square the picture fits in, in points. */
  size: number;
  /** Written instead when there is no picture or it cannot be loaded. */
  fallback?: string;
}

export interface PdfCell {
  text: string;
  /** Smaller, muted line under the text (clan of a player, attacks of an average). */
  note?: string;
  emphasis?: PdfEmphasis;
}

/** `strong`: bold; `danger`: bold red (something missing); `muted`: grey. */
export type PdfEmphasis = 'strong' | 'danger' | 'muted';

/** Colour of a group: a band on the left of its rows and its heading. */
export type PdfAccent = 'starter' | 'reserve';

export interface PdfRowGroup<T> {
  title?: string;
  accent?: PdfAccent;
  rows: readonly T[];
  /** Starts a new page, with the header row of the table again. */
  pageBreakBefore?: boolean;
  /**
   * Title in the header of the pages of this group and the next ones, when it starts a page (first
   * group or `pageBreakBefore`); the previous one (or the `title` of the PDF) otherwise.
   */
  pageTitle?: string;
}

/**
 * Colours of the exported pages, from the `--cn-pdf-*` tokens of the palette: every document in the
 * look of the site's "iron" theme (dark iron, gold edges and headings, light text).
 */
export interface PdfTheme {
  /** Page colour, under the brushed-iron picture. */
  bg: string;
  /** Panels and table rows. */
  plate: string;
  /** Every other table row, totals. */
  stripe: string;
  tile: string;
  /** Outlines of panels and tiles. */
  edge: string;
  /** Lines between table rows. */
  line: string;
  text: string;
  muted: string;
  /** Table header row. */
  band: string;
  gold: string;
  goldText: string;
  ember: string;
  danger: string;
  starter: string;
  starterTint: string;
  reserve: string;
  reserveTint: string;
  /** The QR code: dark modules on light paper, so phones read it. */
  qrInk: string;
  qrPaper: string;
}

const THEME_TOKENS: Record<keyof PdfTheme, string> = {
  bg: '--cn-pdf-iron-bg',
  plate: '--cn-pdf-iron-plate',
  stripe: '--cn-pdf-iron-stripe',
  tile: '--cn-pdf-iron-tile',
  edge: '--cn-pdf-iron-edge',
  line: '--cn-pdf-iron-line',
  text: '--cn-pdf-iron-text',
  muted: '--cn-pdf-iron-muted',
  band: '--cn-pdf-band',
  gold: '--cn-pdf-gold',
  goldText: '--cn-pdf-gold-text',
  ember: '--cn-pdf-iron-ember',
  danger: '--cn-pdf-danger',
  starter: '--cn-pdf-starter',
  starterTint: '--cn-pdf-starter-tint',
  reserve: '--cn-pdf-reserve',
  reserveTint: '--cn-pdf-reserve-tint',
  qrInk: '--cn-pdf-band',
  qrPaper: '--cn-pdf-band-text',
};

/** The PDF colours of the palette (identity tokens: the same in every theme). */
export function readPdfTheme(): PdfTheme {
  const entries = Object.entries(THEME_TOKENS).map(([key, token]) => [key, cssColor(token)]);
  return Object.fromEntries(entries) as PdfTheme;
}
