import type { CanvasElement, Content } from 'pdfmake/interfaces';
import { PdfTheme } from './table-pdf';
import type { PdfFrame } from './table-pdf-document';

/**
 * The page of every PDF of the site, in the look of its "iron" theme: dark brushed iron (a picture
 * made by `PdfToolkit.ironPlate`) inside a double gold frame with gold studs, a header with crest,
 * clan and title over a gold and an ember rule, a footer with the fan content notice, the site and
 * the page number. Pure (no DOM), shared by the table exports and the bases PDF.
 */

/** Page margins, in points: the content starts under the header and ends over the footer. */
export const IRON_MARGIN_X = 40;
export const IRON_MARGIN_TOP = 108;
export const IRON_MARGIN_BOTTOM = 62;
/** How much lower the rules of the header (and the content) go when it has a subtitle. */
export const IRON_SUBTITLE_SPACE = 12;
/** Insets of the double gold frame of every page. */
const FRAME_OUTER = 16;
const FRAME_INNER = 21;
const HEADER_TOP = 34;
const HEADER_CREST = 40;

/** Dark iron (or a picture, e.g. a cover) over the whole page, inside a double frame with studs. */
export function ironPage(
  picture: string | null,
  theme: PdfTheme,
  width: number,
  height: number,
): Content[] {
  const stud = (x: number, y: number): CanvasElement[] => [
    { type: 'ellipse', x, y, r1: 3.2, r2: 3.2, color: theme.gold },
    { type: 'ellipse', x: x - 0.8, y: y - 0.8, r1: 1.1, r2: 1.1, color: theme.goldText },
  ];
  const corners: [number, number][] = [
    [FRAME_OUTER, FRAME_OUTER],
    [width - FRAME_OUTER, FRAME_OUTER],
    [FRAME_OUTER, height - FRAME_OUTER],
    [width - FRAME_OUTER, height - FRAME_OUTER],
  ];
  return [
    {
      canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: height, color: theme.bg }],
      absolutePosition: { x: 0, y: 0 },
    },
    picture
      ? { image: picture, width, height, absolutePosition: { x: 0, y: 0 } }
      : { text: '', absolutePosition: { x: 0, y: 0 } },
    {
      canvas: [
        {
          type: 'rect',
          x: FRAME_OUTER,
          y: FRAME_OUTER,
          w: width - FRAME_OUTER * 2,
          h: height - FRAME_OUTER * 2,
          lineColor: theme.gold,
          lineWidth: 1.3,
        },
        {
          type: 'rect',
          x: FRAME_INNER,
          y: FRAME_INNER,
          w: width - FRAME_INNER * 2,
          h: height - FRAME_INNER * 2,
          lineColor: theme.edge,
          lineWidth: 0.6,
        },
        ...corners.flatMap(([x, y]) => stud(x, y)),
      ],
      absolutePosition: { x: 0, y: 0 },
    },
  ];
}

/** A gold rule with a diamond in the middle, centred on `x`. */
export function ironOrnament(
  x: number,
  y: number,
  width: number,
  theme: PdfTheme,
): CanvasElement[] {
  const half = width / 2;
  const d = 3.5;
  return [
    {
      type: 'line',
      x1: x - half,
      y1: y,
      x2: x - d - 4,
      y2: y,
      lineWidth: 0.8,
      lineColor: theme.gold,
    },
    {
      type: 'line',
      x1: x + d + 4,
      y1: y,
      x2: x + half,
      y2: y,
      lineWidth: 0.8,
      lineColor: theme.gold,
    },
    {
      type: 'polyline',
      points: [
        { x, y: y - d },
        { x: x + d, y },
        { x, y: y + d },
        { x: x - d, y },
      ],
      closePath: true,
      color: theme.gold,
      lineColor: theme.gold,
    },
  ];
}

/** What the header of the pages says besides the clan. */
export interface IronHeading {
  title: string;
  subtitle?: string;
  /** `Generato il …`, against the right margin; left out when missing. */
  date?: string;
}

/** Crest, clan, title (and subtitle, date) over a gold and an ember rule. */
export function ironHeader(heading: IronHeading, frame: PdfFrame, width: number): Content[] {
  const { theme } = frame;
  const textX = IRON_MARGIN_X + (frame.crest ? HEADER_CREST + 12 : 0);
  const rule = HEADER_TOP + HEADER_CREST + 14 + (heading.subtitle ? IRON_SUBTITLE_SPACE : 0);
  return [
    frame.crest
      ? {
          image: 'crest',
          fit: [HEADER_CREST, HEADER_CREST],
          absolutePosition: { x: IRON_MARGIN_X, y: HEADER_TOP },
        }
      : { text: '', absolutePosition: { x: 0, y: 0 } },
    {
      columns: [
        {
          width: width - textX - IRON_MARGIN_X,
          stack: [
            {
              text: [
                { text: frame.brand.toUpperCase(), font: 'CinzelDecorative' },
                {
                  text: `   ${frame.clanTag}`,
                  font: 'InterSemiBold',
                  fontSize: 7,
                  color: theme.muted,
                },
              ],
              fontSize: 9.5,
              color: theme.goldText,
              characterSpacing: 0.6,
            },
            {
              text: heading.title,
              font: 'Cinzel',
              fontSize: 17,
              color: theme.text,
              margin: [0, 3, 0, 0],
            },
            heading.subtitle
              ? { text: heading.subtitle, fontSize: 8, color: theme.muted, margin: [0, 1, 0, 0] }
              : '',
          ],
        },
      ],
      absolutePosition: { x: textX, y: HEADER_TOP + 2 },
    },
    heading.date
      ? {
          // A column as wide as the content area: the date sits against the right margin.
          columns: [
            {
              width: width - IRON_MARGIN_X * 2,
              text: heading.date,
              fontSize: 7,
              color: theme.muted,
              alignment: 'right',
            },
          ],
          absolutePosition: { x: IRON_MARGIN_X, y: HEADER_TOP + 3 },
        }
      : { text: '', absolutePosition: { x: 0, y: 0 } },
    {
      canvas: [
        {
          type: 'line',
          x1: IRON_MARGIN_X,
          y1: rule,
          x2: width - IRON_MARGIN_X,
          y2: rule,
          lineWidth: 1,
          lineColor: theme.gold,
        },
        {
          type: 'line',
          x1: IRON_MARGIN_X,
          y1: rule + 2.5,
          x2: width - IRON_MARGIN_X,
          y2: rule + 2.5,
          lineWidth: 0.5,
          lineColor: theme.ember,
        },
      ],
      absolutePosition: { x: 0, y: 0 },
    },
  ];
}

/** A rule, the fan content notice, the site and the page number. */
export function ironFooter(
  frame: PdfFrame,
  currentPage: number,
  pageCount: number,
  width: number,
): Content {
  const { theme } = frame;
  return {
    margin: [IRON_MARGIN_X, 12, IRON_MARGIN_X, 0],
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: width - IRON_MARGIN_X * 2,
            y2: 0,
            lineWidth: 0.5,
            lineColor: theme.edge,
          },
        ],
      },
      {
        margin: [0, 6, 0, 0],
        columns: [
          { width: '*', text: frame.fanContent, fontSize: 6, color: theme.muted },
          {
            width: 'auto',
            text: `${frame.site}  ·  ${frame.page(currentPage, pageCount)}`,
            fontSize: 7,
            color: theme.goldText,
            alignment: 'right',
            noWrap: true,
            margin: [12, 0, 0, 0],
          },
        ],
      },
    ],
  };
}
