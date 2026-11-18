import type { Content, ContentText, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  IRON_MARGIN_BOTTOM,
  IRON_MARGIN_TOP,
  IRON_MARGIN_X,
  ironFooter,
  ironHeader,
  ironOrnament,
  ironPage,
} from '../../../shared/pdf/iron-pdf';
import { PdfTheme } from '../../../shared/pdf/table-pdf';
import { PdfFrame, PictureRegistry } from '../../../shared/pdf/table-pdf-document';
import { BasesPdf, BasesPdfArt, BasesPdfPage, BasesPdfTroop } from './bases-pdf';

/**
 * Builds the pdfmake document of a {@link BasesPdf}: pure (no pdfmake code, no DOM), so the layout
 * can be tested. `BasesPdfExporter` loads the pictures, paints the cover and the iron of the pages
 * ({@link BasesPdfArt}) and renders it.
 *
 * Every page is dark iron, as the site's "iron" theme, inside a double gold frame with gold studs.
 * Page 1 is the cover: the chosen picture over the whole page, the crest and the clan's name at the
 * top, the title in the middle between gold rules. Every other page is a base: a header with crest,
 * clan and title, then the town hall, the screenshot in a gold frame, the reinforcements next to the
 * QR code and the big "Link base", then the description.
 */

/** A4 portrait, in points. */
const PAGE_WIDTH = 595;
const MARGIN_X = IRON_MARGIN_X;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const COVER_CREST = 76;
const TOWN_HALL_SIZE = 52;
/** Highest a screenshot may be drawn: lower when the description is long, so a base fits a page. */
const SCREENSHOT_MAX_HEIGHT = 290;
const SCREENSHOT_FRAME = 5;
const TROOP_SIZE = 30;
const TROOPS_PER_ROW = 5;
const LINK_COLUMN = 150;
const QR_SIZE = 96;

export function buildBasesPdf(
  pdf: BasesPdf,
  frame: PdfFrame,
  art: BasesPdfArt,
): TDocumentDefinitions {
  const iron = frame.theme;
  const images = new PictureRegistry(frame);
  const cover = art.cover ? images.add('cover', art.cover) : null;
  const plate = art.page ? images.add('page', art.page) : null;
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGIN_X, IRON_MARGIN_TOP, MARGIN_X, IRON_MARGIN_BOTTOM],
    info: {
      title: pdf.title,
      author: frame.brand,
      creator: frame.brand,
      subject: pdf.cover.kicker,
    },
    defaultStyle: { font: 'Inter', fontSize: 9, color: iron.text, lineHeight: 1.1 },
    background: (page, size) => [
      ...ironPage(page === 1 ? cover : plate, iron, size.width, size.height),
      ...(page === 1
        ? coverPage(pdf, frame, iron, size.width, size.height)
        : ironHeader({ title: pdf.title }, frame, size.width)),
    ],
    footer: (page, pageCount, size) =>
      page === 1 ? coverFooter(frame, iron) : ironFooter(frame, page, pageCount, size.width),
    // The cover is all background: its content is an empty line, every base starts a new page.
    content: [{ text: ' ' }, ...pdf.pages.map((page) => basePage(page, pdf, iron, images))],
    // Registered last: the pages above add their pictures while being built.
    images: images.dictionary(),
  };
}

// --- Cover --------------------------------------------------------------------------------------

/** Points of the title: smaller as it gets longer, so it fits in a few lines. */
export function coverTitleSize(title: string): number {
  const length = [...title].length;
  if (length <= 16) return 46;
  if (length <= 30) return 38;
  if (length <= 50) return 30;
  return 24;
}

/** About how many lines the title takes (Cinzel: wide capitals), to centre it on the page. */
function coverTitleLines(title: string, size: number, width: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * 0.7)));
  let lines = 1;
  let used = 0;
  for (const word of title.split(/\s+/).filter(Boolean)) {
    const length = [...word].length;
    if (used && used + 1 + length > perLine) {
      lines++;
      used = length;
    } else {
      used += (used ? 1 : 0) + length;
    }
  }
  return lines;
}

function coverPage(
  pdf: BasesPdf,
  frame: PdfFrame,
  iron: PdfTheme,
  width: number,
  height: number,
): Content[] {
  const textWidth = width - 120;
  const size = coverTitleSize(pdf.title);
  const titleHeight = coverTitleLines(pdf.title, size, textWidth) * size * 1.15;
  // Kicker (11 + 14), rule (16), title, rule (16), summary (14): centred on the page.
  const blockHeight = 25 + 16 + titleHeight + 16 + 14;
  const top = height * 0.5 - blockHeight / 2;
  const center = width / 2;
  const centered = (content: Content, y: number): Content => ({
    columns: [{ width, ...(content as object) } as Content],
    absolutePosition: { x: 0, y },
  });
  return [
    {
      canvas: [
        ...ironOrnament(center, 196, 110, iron),
        ...ironOrnament(center, top + 25 + 6, 150, iron),
        ...ironOrnament(center, top + 25 + 16 + titleHeight + 8, 150, iron),
      ],
      absolutePosition: { x: 0, y: 0 },
    },
    frame.crest
      ? {
          image: 'crest',
          fit: [COVER_CREST, COVER_CREST],
          absolutePosition: { x: center - COVER_CREST / 2, y: 52 },
        }
      : { text: '', absolutePosition: { x: 0, y: 0 } },
    centered(
      {
        text: frame.brand.toUpperCase(),
        font: 'CinzelDecorative',
        fontSize: 30,
        color: iron.goldText,
        characterSpacing: 2,
        alignment: 'center',
      },
      136,
    ),
    centered(
      {
        text: frame.clanTag,
        font: 'InterSemiBold',
        fontSize: 8,
        color: iron.muted,
        characterSpacing: 2,
        alignment: 'center',
      },
      178,
    ),
    centered(
      {
        text: pdf.cover.kicker.toUpperCase(),
        font: 'Cinzel',
        fontSize: 11,
        color: iron.goldText,
        characterSpacing: 3,
        alignment: 'center',
      },
      top,
    ),
    {
      columns: [
        {
          width: textWidth,
          text: pdf.title,
          font: 'Cinzel',
          fontSize: size,
          color: iron.text,
          alignment: 'center',
          lineHeight: 1,
        },
      ],
      absolutePosition: { x: (width - textWidth) / 2, y: top + 25 + 16 },
    },
    centered(
      {
        text: pdf.cover.summary,
        fontSize: 10,
        color: iron.muted,
        characterSpacing: 0.5,
        alignment: 'center',
      },
      top + 25 + 16 + titleHeight + 16 + 4,
    ),
  ];
}

/** Site and fan content notice, light on the dark bottom of the cover. */
function coverFooter(frame: PdfFrame, iron: PdfTheme): Content {
  return {
    margin: [MARGIN_X + 8, 8, MARGIN_X + 8, 0],
    stack: [
      { text: frame.site, fontSize: 7.5, color: iron.goldText, alignment: 'center' },
      {
        text: frame.fanContent,
        fontSize: 6,
        color: iron.muted,
        alignment: 'center',
        margin: [0, 3, 0, 0],
      },
    ],
  };
}

// --- Base pages: content ------------------------------------------------------------------------

function basePage(
  page: BasesPdfPage,
  pdf: BasesPdf,
  iron: PdfTheme,
  images: PictureRegistry,
): Content {
  const description = page.description.trim();
  return {
    pageBreak: 'before',
    stack: [
      heading(page, iron, images),
      screenshot(page, iron, images, description.length),
      {
        columns: [
          { width: '*', stack: [castle(page, pdf, iron, images)] },
          { width: LINK_COLUMN, stack: [linkCard(page, pdf, iron)] },
        ],
        columnGap: 12,
        margin: [0, 12, 0, 0],
      },
      ...(description ? [descriptionBlock(description, pdf, iron, images)] : []),
    ],
  };
}

function heading(page: BasesPdfPage, iron: PdfTheme, images: PictureRegistry): Content {
  const picture = page.townHallImage ? images.picture(page.townHallImage) : null;
  return {
    columns: [
      picture
        ? { width: TOWN_HALL_SIZE, image: picture, fit: [TOWN_HALL_SIZE, TOWN_HALL_SIZE] }
        : { width: 0, text: '' },
      {
        width: '*',
        stack: [
          { text: page.heading, font: 'Cinzel', fontSize: 24, color: iron.goldText },
          {
            text: page.counter.toUpperCase(),
            font: 'InterSemiBold',
            fontSize: 7.5,
            color: iron.muted,
            characterSpacing: 1.5,
            margin: [0, 2, 0, 0],
          },
        ],
        margin: [0, picture ? 9 : 0, 0, 0],
      },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 12],
  };
}

/** Highest the screenshot may be, so that a long description still fits the page. */
export function screenshotMaxHeight(descriptionLength: number): number {
  if (descriptionLength > 600) return 200;
  if (descriptionLength > 300) return 240;
  return SCREENSHOT_MAX_HEIGHT;
}

/** A panel of dark iron with an outline (gold for the main ones). */
function panel(cell: TableCell, iron: PdfTheme, edge: string, padding: number): Content {
  return {
    table: { widths: ['*'], body: [[{ ...(cell as object), fillColor: iron.plate } as TableCell]] },
    layout: {
      hLineWidth: () => 1.2,
      vLineWidth: () => 1.2,
      hLineColor: () => edge,
      vLineColor: () => edge,
      paddingLeft: () => padding,
      paddingRight: () => padding,
      paddingTop: () => padding,
      paddingBottom: () => padding,
    },
  };
}

function screenshot(
  page: BasesPdfPage,
  iron: PdfTheme,
  images: PictureRegistry,
  descriptionLength: number,
): Content {
  const key = images.picture(page.image);
  const inner = CONTENT_WIDTH - SCREENSHOT_FRAME * 2 - 2.4;
  const maxHeight = screenshotMaxHeight(descriptionLength);
  const body: TableCell = key
    ? { image: key, fit: [inner, maxHeight], alignment: 'center', link: page.layoutUrl }
    : {
        text: page.heading,
        alignment: 'center',
        color: iron.muted,
        margin: [0, maxHeight / 2 - 6, 0, maxHeight / 2 - 6],
      };
  return panel(body, iron, iron.gold, SCREENSHOT_FRAME);
}

function sectionTitle(text: string, iron: PdfTheme, note?: string): Content {
  return {
    stack: [
      {
        text: [
          { text: text.toUpperCase(), font: 'Cinzel', fontSize: 11, color: iron.goldText },
          ...(note ? [{ text: `   ${note}`, fontSize: 8, color: iron.muted }] : []),
        ],
        characterSpacing: 0.6,
      },
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 36, h: 1.4, color: iron.ember }],
        margin: [0, 4, 0, 8],
      },
    ],
  };
}

function castle(
  page: BasesPdfPage,
  pdf: BasesPdf,
  iron: PdfTheme,
  images: PictureRegistry,
): Content {
  const title = sectionTitle(pdf.labels.castle, iron, page.troops.length ? page.castleSpace : '');
  if (!page.troops.length) {
    return panel(
      { stack: [title, { text: pdf.labels.noTroops, color: iron.muted, fontSize: 8.5 }] },
      iron,
      iron.edge,
      10,
    );
  }
  const rows: TableCell[][] = [];
  for (let i = 0; i < page.troops.length; i += TROOPS_PER_ROW) {
    const row = page.troops.slice(i, i + TROOPS_PER_ROW).map((t) => troopCell(t, iron, images));
    while (row.length < TROOPS_PER_ROW) row.push({ text: '' });
    rows.push(row);
  }
  return panel(
    {
      stack: [
        title,
        {
          table: { widths: Array<string>(TROOPS_PER_ROW).fill('*'), body: rows },
          layout: {
            hLineWidth: () => 3,
            vLineWidth: () => 3,
            hLineColor: () => iron.plate,
            vLineColor: () => iron.plate,
            paddingLeft: () => 2,
            paddingRight: () => 2,
            paddingTop: () => 5,
            paddingBottom: () => 4,
          },
          margin: [-3, 0, -3, 0],
        },
      ],
    },
    iron,
    iron.edge,
    10,
  );
}

function troopCell(troop: BasesPdfTroop, iron: PdfTheme, images: PictureRegistry): TableCell {
  const picture = troop.icon ? images.picture(troop.icon) : null;
  return {
    stack: [
      picture
        ? { image: picture, fit: [TROOP_SIZE, TROOP_SIZE], alignment: 'center' }
        : { text: '', margin: [0, TROOP_SIZE / 2, 0, TROOP_SIZE / 2] },
      {
        text: `×${troop.count}`,
        font: 'InterSemiBold',
        bold: true,
        fontSize: 9.5,
        color: iron.goldText,
        alignment: 'center',
        margin: [0, 2, 0, 0],
      },
      { text: troop.name, fontSize: 6, color: iron.muted, alignment: 'center' },
    ],
    fillColor: iron.tile,
  };
}

/** The QR code of the base (dark on light, so phones read it) and the big "Link base". */
function linkCard(page: BasesPdfPage, pdf: BasesPdf, iron: PdfTheme): Content {
  return panel(
    {
      stack: [
        {
          // Elastic columns on both sides keep the code in the middle, whatever its exact width
          // (pdfmake rounds it to whole modules).
          columns: [
            { width: '*', text: '' },
            {
              width: 'auto',
              table: {
                widths: ['auto'],
                body: [
                  [
                    {
                      qr: page.layoutUrl,
                      fit: QR_SIZE,
                      foreground: iron.qrInk,
                      background: iron.qrPaper,
                      eccLevel: 'M',
                      fillColor: iron.qrPaper,
                    } as TableCell,
                  ],
                ],
              },
              layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 4,
                paddingRight: () => 4,
                paddingTop: () => 4,
                paddingBottom: () => 4,
              },
            },
            { width: '*', text: '' },
          ],
          columnGap: 0,
        },
        {
          text: pdf.labels.link.toUpperCase(),
          link: page.layoutUrl,
          font: 'Cinzel',
          fontSize: 15,
          color: iron.goldText,
          alignment: 'center',
          characterSpacing: 1,
          margin: [0, 9, 0, 3],
        } satisfies ContentText,
        { text: pdf.labels.scan, fontSize: 6.5, color: iron.muted, alignment: 'center' },
      ],
    },
    iron,
    iron.gold,
    9,
  );
}

function descriptionBlock(
  description: string,
  pdf: BasesPdf,
  iron: PdfTheme,
  images: PictureRegistry,
): Content {
  const style = { size: 9.5, bold: false, color: iron.text, maxWidth: CONTENT_WIDTH - 28 };
  const picture = images.text(description, style);
  const text: Content = picture ?? { text: description, fontSize: 9.5, lineHeight: 1.3 };
  return {
    stack: [
      panel({ stack: [sectionTitle(pdf.labels.description, iron), text] }, iron, iron.edge, 12),
    ],
    margin: [0, 12, 0, 0],
    unbreakable: description.length < 400,
  };
}
