import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfTheme } from '../../../shared/pdf/table-pdf';
import { PdfFrame } from '../../../shared/pdf/table-pdf-document';
import { BasesPdf, BasesPdfArt, BasesPdfPage, basesPdfImageUrls } from './bases-pdf';
import { buildBasesPdf, coverTitleSize, screenshotMaxHeight } from './bases-pdf-document';

const THEME = Object.fromEntries(
  [
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
  ].map((key) => [key, key]),
) as unknown as PdfTheme;

const LINK = 'https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAA';

const FRAME: PdfFrame = {
  brand: 'Crociata Nera',
  clanTag: '#2J8JVVCLC',
  site: 'crociatanera.it',
  generatedAt: 'Generato il 18 nov 2026',
  page: (n, total) => `Pagina ${n} di ${total}`,
  fanContent: 'Non ufficiale.',
  crest: 'data:image/png;base64,CREST',
  images: {
    'shot-a': 'data:image/jpeg;base64,A',
    'th-18': 'data:image/png;base64,TH18',
    golem: 'data:image/png;base64,GOLEM',
  },
  textImage: (text) => ({
    dataUrl: `data:image/png;base64,${text.length}`,
    width: 300,
    height: 40,
  }),
  theme: THEME,
};

function page(override: Partial<BasesPdfPage> = {}): BasesPdfPage {
  return {
    townHallLevel: 18,
    townHallImage: 'th-18',
    image: 'shot-a',
    layoutUrl: LINK,
    troops: [
      { name: 'Golem', count: 1, icon: 'golem' },
      { name: 'Witch', count: 2, icon: null },
    ],
    castleSpace: '54/55 spazi',
    description: 'Anti 3 stelle',
    heading: 'Municipio 18',
    counter: 'Base 1 di 2',
    ...override,
  };
}

function pdf(pages: BasesPdfPage[] = [page(), page({ description: '', troops: [] })]): BasesPdf {
  return {
    fileName: 'crociata-nera-basi',
    title: 'Basi per la CWL',
    cover: { kicker: 'Arsenale basi', summary: '2 basi · Municipio 18' },
    pages,
    labels: {
      castle: 'Castello del clan',
      noTroops: 'Nessun rinforzo',
      link: 'Link base',
      scan: 'Inquadra il codice',
      description: 'Descrizione',
    },
  };
}

const SIZE = { width: 595, height: 842, orientation: 'portrait' as const };

/** Every value of a node and its children, to look for texts, pictures and links. */
function walk(node: unknown, visit: (value: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!node || typeof node !== 'object') return;
  visit(node as Record<string, unknown>);
  Object.values(node).forEach((child) => walk(child, visit));
}

function texts(node: unknown): string[] {
  const found: string[] = [];
  walk(node, (value) => {
    if (typeof value['text'] === 'string') found.push(value['text']);
  });
  return found;
}

function find(node: unknown, key: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  walk(node, (value) => {
    if (key in value) found.push(value);
  });
  return found;
}

function build(source = pdf(), cover: string | null = 'data:image/jpeg;base64,COVER') {
  const art: BasesPdfArt = { cover, page: 'data:image/jpeg;base64,IRON' };
  const doc: TDocumentDefinitions = buildBasesPdf(source, FRAME, art);
  const background = doc.background as (page: number, size: typeof SIZE) => Content;
  const footer = doc.footer as (page: number, count: number, size: typeof SIZE) => Content;
  const content = doc.content as Content[];
  return { doc, background, footer, content };
}

describe('buildBasesPdf', () => {
  it('opens with a cover: picture, crest, clan name at the top, title and summary', () => {
    const { doc, background } = build();
    const cover = background(1, SIZE);
    const words = texts(cover);
    expect(words).toContain('CROCIATA NERA');
    expect(words).toContain('Basi per la CWL');
    expect(words).toContain('ARSENALE BASI');
    expect(words).toContain('2 basi · Municipio 18');
    // No date on the cover.
    expect(words.join(' ')).not.toContain('Generato');
    const pictures = find(cover, 'image').map((value) => value['image']);
    expect(pictures).toContain('crest');
    const coverKey = pictures.find((key) => key !== 'crest') as string;
    expect(doc.images![coverKey]).toBe('data:image/jpeg;base64,COVER');
    // Full page.
    expect(find(cover, 'image').find((v) => v['image'] === coverKey)).toMatchObject({
      width: 595,
      height: 842,
    });
  });

  it('draws a plain dark cover without a picture', () => {
    const { background } = build(pdf(), null);
    const pictures = find(background(1, SIZE), 'image').map((value) => value['image']);
    expect(pictures).toEqual(['crest']);
  });

  it('gives the cover its own footer and the other pages an iron header and the page number', () => {
    const { doc, background, footer } = build();
    const coverFooter = texts(footer(1, 3, SIZE)).join(' ');
    expect(coverFooter).not.toContain('Pagina');
    expect(coverFooter).not.toContain('Generato');
    expect(coverFooter).toContain('Non ufficiale.');
    expect(texts(footer(2, 3, SIZE)).join(' ')).toContain('Pagina 2 di 3');
    const page = background(2, SIZE);
    const header = texts(page);
    expect(header).toContain('Basi per la CWL');
    expect(header.join(' ')).not.toContain('Generato');
    // Brushed iron over the whole page, the dark colour under it.
    const iron = find(page, 'image').find(
      (v) => doc.images![v['image'] as string] === 'data:image/jpeg;base64,IRON',
    );
    expect(iron).toMatchObject({ width: 595, height: 842 });
    expect(find(page, 'color').some((v) => v['color'] === 'bg')).toBe(true);
  });

  it('puts every base on a page of its own', () => {
    const { content } = build();
    // The empty line of the cover, then the bases.
    expect(content).toHaveLength(3);
    expect(
      content.slice(1).every((c) => (c as { pageBreak?: string }).pageBreak === 'before'),
    ).toBe(true);
  });

  it('shows town hall, screenshot, reinforcements, QR code, link and description', () => {
    const { doc, content } = build();
    const base = content[1];
    const words = texts(base);
    expect(words).toEqual(
      expect.arrayContaining([
        'Municipio 18',
        'BASE 1 DI 2',
        '×1',
        'Golem',
        '×2',
        'Witch',
        'LINK BASE',
      ]),
    );
    // The link is not written out: "Link base" opens it.
    expect(words).not.toContain(LINK);
    expect(words).toContain('Anti 3 stelle');
    expect(words).toContain('DESCRIZIONE');
    expect(find(base, 'qr')[0]).toMatchObject({ qr: LINK });
    // "Link base" and the screenshot open the base in the game.
    const links = find(base, 'link');
    expect(links.every((value) => value['link'] === LINK)).toBe(true);
    expect(links.find((value) => value['text'] === 'LINK BASE')).toMatchObject({ fontSize: 15 });
    expect(links).toHaveLength(2);
    const images = find(base, 'image').map((value) => doc.images![value['image'] as string]);
    expect(images).toEqual(
      expect.arrayContaining([
        'data:image/png;base64,TH18',
        'data:image/jpeg;base64,A',
        'data:image/png;base64,GOLEM',
      ]),
    );
  });

  it('leaves out the description when there is none and says when there are no reinforcements', () => {
    const { content } = build();
    const words = texts(content[2]);
    expect(words).not.toContain('DESCRIZIONE');
    expect(words).toContain('Nessun rinforzo');
  });

  it('draws a description with emoji as a picture', () => {
    const { content } = build(pdf([page({ description: 'Forte ⚔️ in guerra' })]));
    expect(texts(content[1])).not.toContain('Forte ⚔️ in guerra');
    expect(find(content[1], 'image').some((value) => value['width'] === 300)).toBe(true);
  });

  it('lists the pictures to load: screenshots apart from the icons', () => {
    expect(basesPdfImageUrls(pdf())).toEqual({
      screenshots: ['shot-a'],
      icons: ['th-18', 'golem'],
    });
  });

  it('makes long titles smaller and screenshots lower when the description is long', () => {
    expect(coverTitleSize('Basi')).toBeGreaterThan(coverTitleSize('Basi per la CWL di dicembre'));
    expect(coverTitleSize('x'.repeat(80))).toBe(24);
    expect(screenshotMaxHeight(0)).toBeGreaterThan(screenshotMaxHeight(400));
    expect(screenshotMaxHeight(400)).toBeGreaterThan(screenshotMaxHeight(900));
  });
});
