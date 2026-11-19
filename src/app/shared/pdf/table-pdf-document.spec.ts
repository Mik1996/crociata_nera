import type { Content, ContentSection, ContentTable, TableCell } from 'pdfmake/interfaces';
import { PdfTheme, TablePdf } from './table-pdf';
import { buildTablePdf, needsTextImage, PdfFrame, pdfImageUrls } from './table-pdf-document';

const THEME = Object.fromEntries(keys().map((key) => [key, key])) as unknown as PdfTheme;

function keys(): (keyof PdfTheme)[] {
  return [
    'bg',
    'plate',
    'stripe',
    'tile',
    'edge',
    'line',
    'text',
    'muted',
    'band',
    'gold',
    'goldText',
    'ember',
    'danger',
    'starter',
    'starterTint',
    'reserve',
    'reserveTint',
    'qrInk',
    'qrPaper',
  ];
}

const FRAME: PdfFrame = {
  brand: 'Crociata Nera',
  clanTag: '#2J8JVVCLC',
  site: 'crociatanera.it',
  generatedAt: 'Generato il 18 nov 2026',
  page: (n, total) => `Pagina ${n} di ${total}`,
  fanContent: 'Non ufficiale.',
  crest: 'data:image/png;base64,AAAA',
  images: { 'game/th-17.webp': 'data:image/png;base64,TH17' },
  textImage: (text) => ({ dataUrl: `data:image/png;base64,${text.length}`, width: 30, height: 11 }),
  theme: THEME,
};

interface Row {
  name: string;
  gold: number;
  missing?: boolean;
}

function pdf(override: Partial<TablePdf<Row>> = {}): TablePdf<Row> {
  return {
    fileName: 'test',
    title: 'Raid Weekend',
    subtitle: '14 – 17 nov 2026',
    facts: [
      { label: 'Oro', value: '1.000' },
      { label: 'Attacchi', value: '12' },
    ],
    columns: [
      { header: 'Giocatore', cell: (r) => ({ text: r.name, note: 'note' }) },
      {
        header: 'Oro',
        align: 'right',
        width: 'auto',
        cell: (r) => ({ text: String(r.gold), emphasis: r.missing ? 'danger' : undefined }),
      },
    ],
    groups: [
      {
        rows: [
          { name: 'A', gold: 10 },
          { name: 'B', gold: 5, missing: true },
        ],
      },
    ],
    emptyText: 'Nessuno',
    ...override,
  };
}

/** The sections of the document, each starting a page with its own header. */
function sections(doc: ReturnType<typeof buildTablePdf>): ContentSection[] {
  return doc.content as ContentSection[];
}

/** The blocks of every section, in order. */
function content(doc: ReturnType<typeof buildTablePdf>): Content[] {
  return sections(doc).flatMap((part) => part.section as Content[]);
}

type Background = (page: number, size: { width: number; height: number }) => Content;

/** The header of a section's pages (or of the document's, when `background` is the doc's). */
function header(background: unknown): string {
  return JSON.stringify((background as Background)(1, { width: 595, height: 842 }));
}

/** The main table: the last block of the content. */
function mainTable(doc: ReturnType<typeof buildTablePdf>): ContentTable {
  return content(doc).at(-1) as ContentTable;
}

function texts(row: TableCell[]): string[] {
  return row.map((cell) => {
    const c = cell as { text?: string; stack?: { text: string }[] };
    return c.text ?? c.stack?.[0].text ?? '';
  });
}

describe('buildTablePdf', () => {
  it('lays out an A4 page with the fonts of the site, the title and the facts', () => {
    const doc = buildTablePdf(pdf(), FRAME);
    expect(doc.pageSize).toBe('A4');
    expect(doc.pageOrientation).toBe('portrait');
    expect(doc.defaultStyle).toMatchObject({ font: 'Inter', color: 'text' });
    expect(doc.info).toMatchObject({ title: 'Raid Weekend', author: 'Crociata Nera' });
    expect(doc.images).toEqual({ crest: FRAME.crest });
    const facts = content(doc)[0] as ContentTable;
    expect(facts.table.body).toHaveLength(1);
    expect(JSON.stringify(facts.table.body)).toContain('ATTACCHI');
  });

  it('repeats the header row and marks the problems in the cells', () => {
    const table = mainTable(buildTablePdf(pdf(), FRAME));
    expect(table.table.headerRows).toBe(1);
    expect(table.table.widths).toEqual(['*', 'auto']);
    const [header, a, b] = table.table.body;
    expect(texts(header)).toEqual(['GIOCATORE', 'ORO']);
    expect(header[0]).toMatchObject({ font: 'Cinzel', fillColor: 'band', color: 'goldText' });
    // A note goes under the text, smaller and muted.
    expect(a[0]).toMatchObject({ stack: [{ text: 'A' }, { text: 'note', color: 'muted' }] });
    expect(b[1]).toMatchObject({
      text: '5',
      bold: true,
      color: 'danger',
      alignment: 'right',
      verticalAlignment: 'middle',
    });
    expect(a[0]).toMatchObject({ verticalAlignment: 'middle' });
    // Rows are iron plates, every other one striped.
    expect((a[1] as { fillColor?: string }).fillColor).toBe('plate');
    expect((b[1] as { fillColor?: string }).fillColor).toBe('stripe');
  });

  it('gives grouped rows a coloured band and a heading over the whole width', () => {
    const table = mainTable(
      buildTablePdf(
        pdf({
          groups: [
            { title: 'Schierati', accent: 'starter', rows: [{ name: 'A', gold: 1 }] },
            { title: 'Riserve', accent: 'reserve', rows: [{ name: 'B', gold: 2 }] },
          ],
        }),
        FRAME,
      ),
    );
    expect(table.table.widths).toEqual([4, '*', 'auto']);
    const [, heading, row, reserveHeading, reserve] = table.table.body;
    expect(heading[0]).toMatchObject({ fillColor: 'starter' });
    expect(heading[1]).toMatchObject({ text: 'Schierati', colSpan: 2, color: 'starter' });
    expect(row[0]).toMatchObject({ fillColor: 'starter' });
    expect(reserveHeading[1]).toMatchObject({ text: 'Riserve', fillColor: 'reserveTint' });
    expect(reserve[0]).toMatchObject({ fillColor: 'reserve' });
  });

  it('closes the table with the totals, or says it is empty', () => {
    const withFooter = mainTable(buildTablePdf(pdf({ footer: ['Totale', 15] }), FRAME));
    const last = withFooter.table.body.at(-1)!;
    expect(last[0]).toMatchObject({ text: 'Totale', bold: true, fillColor: 'stripe' });
    expect(last[1]).toMatchObject({ text: '15', bold: true });

    const empty = mainTable(buildTablePdf(pdf({ groups: [{ rows: [] }] }), FRAME));
    expect(empty.table.body).toHaveLength(2);
    expect(empty.table.body[1][0]).toMatchObject({ text: 'Nessuno', colSpan: 2 });
  });

  it('draws the same iron page and header on every page and numbers the pages', () => {
    const doc = buildTablePdf(pdf(), FRAME, 'data:image/jpeg;base64,IRON');
    const background = doc.background as (
      page: number,
      size: { width: number; height: number },
    ) => Content;
    const first = JSON.stringify(background(1, { width: 595, height: 842 }));
    expect(first).toContain('CROCIATA NERA');
    expect(first).toContain('"image":"crest"');
    expect(first).toContain('14 – 17 nov 2026');
    expect(first).toContain('Generato il 18 nov 2026');
    expect(JSON.stringify(background(2, { width: 595, height: 842 }))).toBe(first);
    // Brushed iron over the whole page, the dark colour under it.
    const plate = Object.entries(doc.images!).find(
      ([, url]) => url === 'data:image/jpeg;base64,IRON',
    )![0];
    expect(first).toContain(`"image":"${plate}","width":595,"height":842`);
    expect(first).toContain('"color":"bg"');

    const footer = doc.footer as (page: number, pages: number, size: { width: number }) => Content;
    const text = JSON.stringify(footer(2, 3, { width: 595 }));
    expect(text).toContain('crociatanera.it  ·  Pagina 2 di 3');
    expect(text).toContain('Non ufficiale.');
  });

  it('leaves out the crest when it could not be loaded', () => {
    const doc = buildTablePdf(pdf(), { ...FRAME, crest: null });
    expect(doc.images).toBeUndefined();
    const background = doc.background as (
      page: number,
      size: { width: number; height: number },
    ) => Content;
    expect(JSON.stringify(background(1, { width: 595, height: 842 }))).not.toContain('"image"');
  });

  it('starts a group on a new page with the header row again, then the notes on their own page', () => {
    const doc = buildTablePdf(
      pdf({
        groups: [
          { title: 'Schierati', accent: 'starter', rows: [{ name: 'A', gold: 1 }] },
          {
            title: 'Riserve',
            accent: 'reserve',
            rows: [{ name: 'B', gold: 2 }],
            pageBreakBefore: true,
          },
        ],
        footer: ['Totale', 3],
        notes: { title: 'Regole', items: ['Uno', 'Due'], pageBreakBefore: true },
      }),
      FRAME,
    );
    // Every new page is a section: facts and first table, the reserves, the notes.
    expect(sections(doc).map((part) => (part.section as Content[]).length)).toEqual([2, 1, 1]);
    const [, first, second, notes] = content(doc) as [Content, ContentTable, ContentTable, Content];
    expect(texts(first.table.body[1])).toContain('Schierati');
    expect(first.table.body).toHaveLength(3);
    expect(texts(second.table.body[0])).toEqual(['', 'GIOCATORE', 'ORO']);
    expect(texts(second.table.body[1])).toContain('Riserve');
    // The totals close the last table only.
    expect(texts(second.table.body.at(-1)!)).toContain('Totale');
    expect(JSON.stringify(notes)).toContain('"ul":["Uno","Due"]');
    expect(JSON.stringify(notes)).toContain('Regole');
  });

  it('gives every page the title of its group or notes, the title of the PDF otherwise', () => {
    const groups = (pageTitles: (string | undefined)[]) =>
      pageTitles.map((pageTitle, i) => ({
        title: `G${i}`,
        rows: [{ name: 'A', gold: 1 }],
        pageBreakBefore: i > 0,
        pageTitle,
      }));
    const doc = buildTablePdf(
      pdf({
        groups: groups(['Titolari', 'Riserve', undefined]),
        notes: { title: 'Regole', items: ['Uno'], pageBreakBefore: true, pageTitle: 'Classifica' },
      }),
      FRAME,
    );
    const titles = sections(doc).map((part) => header(part.background));
    expect(titles[0]).toContain('"text":"Titolari"');
    expect(titles[1]).toContain('"text":"Riserve"');
    // A page without its own title keeps the one before.
    expect(titles[2]).toContain('"text":"Riserve"');
    expect(titles[3]).toContain('"text":"Classifica"');
    expect(doc.info).toMatchObject({ title: 'Raid Weekend' });

    const plain = buildTablePdf(pdf(), FRAME);
    expect(sections(plain)).toHaveLength(1);
    expect(header(sections(plain)[0].background)).toContain('"text":"Raid Weekend"');
    expect(header(plain.background)).toContain('"text":"Raid Weekend"');
  });

  it('puts the loaded pictures in their cells, the fallback text when missing', () => {
    const rows = [
      { name: 'A', gold: 17 },
      { name: 'B', gold: 3 },
    ];
    const withPictures = pdf({
      columns: [
        {
          header: 'TH',
          cell: (r) => ({
            image: r.gold === 17 ? 'game/th-17.webp' : 'game/missing.webp',
            size: 20,
            fallback: String(r.gold),
          }),
        },
      ],
      groups: [{ rows }],
    });
    expect(pdfImageUrls(withPictures)).toEqual(['game/th-17.webp', 'game/missing.webp']);
    const doc = buildTablePdf(withPictures, FRAME);
    const [, a, b] = mainTable(doc).table.body;
    expect(a[0]).toMatchObject({ image: 'img0', fit: [20, 20] });
    expect(b[0]).toMatchObject({ text: '3' });
    expect(doc.images).toEqual({ crest: FRAME.crest, img0: 'data:image/png;base64,TH17' });
  });

  it('draws the names with emoji or other scripts as pictures', () => {
    expect(needsTextImage('Sir Lancillotto')).toBe(false);
    expect(needsTextImage('☆ALE☆ Ægir Ñoño Дмитрий')).toBe(false);
    expect(needsTextImage('noyz ⚡ L.K')).toBe(true);
    expect(needsTextImage('Tyler🔥Durden')).toBe(true);
    expect(needsTextImage('龍')).toBe(true);

    const doc = buildTablePdf(
      pdf({
        groups: [
          {
            rows: [
              { name: '🌀sklerato🌀', gold: 1 },
              { name: 'Plain', gold: 2 },
            ],
          },
        ],
      }),
      FRAME,
    );
    const [, emoji, plain] = mainTable(doc).table.body;
    expect(emoji[0]).toMatchObject({
      stack: [{ image: 'img0', width: 30, height: 11 }, { text: 'note' }],
    });
    expect(plain[0]).toMatchObject({ stack: [{ text: 'Plain' }, { text: 'note' }] });
    expect(doc.images!['img0']).toBe('data:image/png;base64,12');
  });
});
