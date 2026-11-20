import sharp from 'sharp';
import { readSiteAsset } from '@/lib/assets/site-assets';
import { AnnouncementData, CwlData, DonationsData, Honour, MonthData, RecordData } from '../announcement-data';
import { COMMENDATION_LABELS, formatNumber, monthLabel, RECORD_LABELS, TIER_LABELS } from '../announcement-texts';
import { IRON_THEME as T } from './announcement-theme';
import { SvgText } from './svg-text';

/**
 * Pictures of the announcements, in the "iron" look of the PDFs: brushed iron, crimson vignette,
 * embers at the foot, double gold frame with studs, the clan's crest on top. Portrait 4:5 (the
 * best fit on a phone). A summary page first, then the commendations ("Albo d'onore") on as many
 * pages as they need.
 */

export const IMAGE_WIDTH = 1080;
export const IMAGE_HEIGHT = 1350;
/** Telegram groups at most 10 pictures in one post. */
const MAX_PAGES = 10;

const W = IMAGE_WIDTH;
const H = IMAGE_HEIGHT;
/** Left and right edge of the content. */
const LEFT = 96;
const RIGHT = W - 96;
/** Top of the content below the header, and its bottom above the footer. */
const CONTENT_TOP = 450;
const CONTENT_BOTTOM = 1210;

/** Crest of each clan of the Crusade, in its colour. */
const CREST_OF: Readonly<Record<string, string>> = {
  '#2J8JVVCLC': 'images/clan-crest-black.webp',
  '#2JU8RPR2G': 'images/clan-crest-red.webp',
  '#2RRYUGQYJ': 'images/clan-crest-gold.webp',
};
const DEFAULT_CREST = 'images/clan-crest-black.webp';

/** A picture of `public/` as a PNG data URI, at most `size` pixels wide (kept in memory). */
const pictures = new Map<string, Promise<string | null>>();
function picture(file: string, size: number): Promise<string | null> {
  const id = `${file}@${size}`;
  let uri = pictures.get(id);
  if (!uri) {
    uri = readSiteAsset(file)
      .then((data) => sharp(data, { density: 300 }).resize({ width: size, height: size, fit: 'inside' }).png().toBuffer())
      .then((png) => `data:image/png;base64,${png.toString('base64')}`)
      .catch((error: unknown) => {
        console.warn(`[announcements] picture ${file} not drawn: ${(error as Error).message}`);
        pictures.delete(id);
        return null;
      });
    pictures.set(id, uri);
  }
  return uri;
}

function image(uri: string | null, x: number, y: number, size: number): string {
  return uri ? `<image href="${uri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : '';
}

/** Trophy of a Clan War League ("Master League I" -> `master-1`). */
function warLeagueFile(name: string | undefined): string | null {
  const match = /^(Champion|Master|Crystal|Gold|Silver|Bronze) League (I{1,3})$/.exec(name ?? '');
  const [, tier, division] = match ?? [];
  return tier && division ? `game/war-leagues/${tier.toLowerCase()}-${division.length}.webp` : null;
}

interface Header {
  /** Small line above the title (the clan). */
  kicker: string;
  title: string;
  subtitle: string;
}

/** Draws the pages of an announcement (SVG). */
export async function announcementSvgs(data: AnnouncementData): Promise<string[]> {
  const text = await SvgText.create();
  const crest = await picture(CREST_OF[data.clanTag] ?? DEFAULT_CREST, 300);
  const page = (header: Header, body: string) => framePage(text, crest, header, body);

  switch (data.kind) {
    case 'month':
      return [
        page({ kicker: data.clanName, title: monthLabel(data.month), subtitle: 'Il mese della Crociata' }, monthBody(text, data)),
        ...(await honourPages(text, data.honours, (n) =>
          page({ kicker: data.clanName, title: "Albo d'onore", subtitle: pageSubtitle(monthLabel(data.month), n) }, ''),
        )),
      ].slice(0, MAX_PAGES);
    case 'cwl':
      return [
        page({ kicker: data.clanName, title: 'Lega fra Clan', subtitle: monthLabel(data.season) }, cwlBody(text, data)),
        ...(await honourPages(text, data.honours, (n) =>
          page({ kicker: data.clanName, title: "Albo d'onore", subtitle: pageSubtitle(`CWL di ${monthLabel(data.season)}`, n) }, ''),
        )),
      ].slice(0, MAX_PAGES);
    case 'donations':
      return [
        page({ kicker: data.clanName, title: 'Donazioni', subtitle: `Stagione di ${monthLabel(data.season)}` }, donationsBody(text, data)),
        ...(await honourPages(text, data.honours, (n) =>
          page({ kicker: data.clanName, title: "Albo d'onore", subtitle: pageSubtitle(`Donazioni di ${monthLabel(data.season)}`, n) }, ''),
        )),
      ].slice(0, MAX_PAGES);
    case 'record':
      return [page({ kicker: data.clanName, title: 'Nuovo record', subtitle: RECORD_LABELS[data.record] }, await recordBody(text, data))];
  }
}

const pageSubtitle = (label: string, n: number) => (n > 1 ? `${label} · ${n}` : label);

/** Draws the pages of an announcement as JPEG files. */
export async function renderAnnouncementImages(data: AnnouncementData): Promise<Buffer[]> {
  const svgs = await announcementSvgs(data);
  return Promise.all(svgs.map(renderSvg));
}

/** Draws one page (0-based); `null` beyond the last. */
export async function renderAnnouncementImage(data: AnnouncementData, page: number): Promise<Buffer | null> {
  const svg = (await announcementSvgs(data))[page];
  return svg ? renderSvg(svg) : null;
}

function renderSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

// --- frame -------------------------------------------------------------------

function framePage(text: SvgText, crest: string | null, header: Header, body: string): string {
  const studs = [
    [36, 36], [W / 2, 36], [W - 36, 36],
    [36, H / 2], [W - 36, H / 2],
    [36, H - 36], [W / 2, H - 36], [W - 36, H - 36],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="url(#stud)" stroke="${T.edge}" stroke-width="2"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${T.stripe}"/><stop offset="0.5" stop-color="${T.plate}"/><stop offset="1" stop-color="${T.background}"/>
  </linearGradient>
  <filter id="brushed" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.9" numOctaves="2" seed="7"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.95  0 0 0 0 0.92  0 0 0 0 0.85  0 0 0 0.09 0"/>
  </filter>
  <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
    <stop offset="0.55" stop-color="${T.crimson}" stop-opacity="0"/><stop offset="1" stop-color="${T.crimson}" stop-opacity="0.55"/>
  </radialGradient>
  <radialGradient id="ember" cx="0.5" cy="1" r="0.6">
    <stop offset="0" stop-color="${T.ember}" stop-opacity="0.38"/><stop offset="1" stop-color="${T.ember}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="stud" cx="0.35" cy="0.35" r="0.7">
    <stop offset="0" stop-color="${T.goldText}"/><stop offset="0.6" stop-color="${T.gold}"/><stop offset="1" stop-color="${T.edge}"/>
  </radialGradient>
  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${T.gold}" stop-opacity="0"/><stop offset="0.5" stop-color="${T.gold}"/><stop offset="1" stop-color="${T.gold}" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="${T.background}"/>
<rect width="${W}" height="${H}" fill="url(#plate)"/>
<rect width="${W}" height="${H}" filter="url(#brushed)"/>
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
<rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#ember)"/>
<rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${T.gold}" stroke-width="6"/>
<rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="${T.gold}" stroke-width="2" stroke-opacity="0.8"/>
${studs}
${image(crest, W / 2 - 75, 68, 150)}
${text.draw(header.kicker.toUpperCase(), { font: 'title', size: 34, x: W / 2, y: 268, fill: T.gold, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 24 })}
${text.draw(header.title, { font: 'display', size: 76, x: W / 2, y: 352, fill: T.goldText, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 44 })}
${text.draw(header.subtitle, { font: 'semibold', size: 30, x: W / 2, y: 398, fill: T.muted, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 22 })}
<rect x="${LEFT}" y="420" width="${RIGHT - LEFT}" height="3" fill="url(#rule)"/>
<rect x="${W / 2 - 160}" y="427" width="320" height="2" fill="${T.ember}" fill-opacity="0.7"/>
${body}
<rect x="${LEFT}" y="1238" width="${RIGHT - LEFT}" height="2" fill="url(#rule)"/>
${text.draw('crociatanera.it', { font: 'title', size: 28, x: W / 2, y: 1284, fill: T.muted, anchor: 'middle' })}
</svg>`;
}

// --- building blocks ---------------------------------------------------------

interface Tile {
  label: string;
  value: string;
  note?: string;
  accent?: string;
}

/** Tiles of figures, two per row (a single one in the middle). Returns the SVG and the y below them. */
function tiles(text: SvgText, items: Tile[], top: number): { svg: string; bottom: number } {
  const gap = 28;
  const width = (RIGHT - LEFT - gap) / 2;
  const height = 168;
  let svg = '';
  items.forEach((tile, i) => {
    const x = items.length === 1 ? (W - width) / 2 : LEFT + (i % 2) * (width + gap);
    const y = top + Math.floor(i / 2) * (height + gap);
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${T.tile}" fill-opacity="0.82" stroke="${T.edge}" stroke-width="2"/>`;
    svg += text.draw(tile.label.toUpperCase(), { font: 'semibold', size: 22, x: x + 28, y: y + 44, fill: T.muted, maxWidth: width - 56, minSize: 16 });
    svg += text.draw(tile.value, { font: 'title', size: 64, x: x + 28, y: y + 116, fill: tile.accent ?? T.goldText, maxWidth: width - 56, minSize: 36 });
    if (tile.note) svg += text.draw(tile.note, { font: 'regular', size: 22, x: x + 28, y: y + 150, fill: T.muted, maxWidth: width - 56, minSize: 16 });
  });
  const rows = Math.ceil(items.length / 2);
  return { svg, bottom: top + rows * height + Math.max(0, rows - 1) * gap };
}

/**
 * Highlighted players (best of the month, best attackers): their names centred, on more lines when
 * they do not fit one. Returns the SVG.
 */
function champion(text: SvgText, top: number, label: string, names: string[], note: string): string {
  const width = RIGHT - LEFT - 60;
  const single = names.length === 1;
  const size = single ? 60 : 44;
  const lineHeight = single ? 0 : 54;
  const lines = single ? names : text.wrap(names, 'bold', size, width).slice(0, 4);
  const height = 190 + (lines.length - 1) * lineHeight;
  return [
    `<rect x="${LEFT}" y="${top}" width="${RIGHT - LEFT}" height="${height}" rx="16" fill="${T.plate}" fill-opacity="0.9" stroke="${T.gold}" stroke-width="3"/>`,
    text.draw(label.toUpperCase(), { font: 'title', size: 26, x: W / 2, y: top + 50, fill: T.gold, anchor: 'middle' }),
    ...lines.map((line, i) =>
      text.draw(line, { font: 'bold', size, x: W / 2, y: top + 120 + i * lineHeight - (single ? 0 : 6), fill: T.text, anchor: 'middle', maxWidth: width, minSize: 30 }),
    ),
    text.draw(note, { font: 'regular', size: 26, x: W / 2, y: top + height - 28, fill: T.muted, anchor: 'middle', maxWidth: width, minSize: 18 }),
  ].join('');
}

function emptyNote(text: SvgText, message: string): string {
  return text.draw(message, { font: 'regular', size: 30, x: W / 2, y: (CONTENT_TOP + CONTENT_BOTTOM) / 2, fill: T.muted, anchor: 'middle' });
}

// --- pages -------------------------------------------------------------------

function monthBody(text: SvgText, data: MonthData): string {
  const items: Tile[] = [];
  if (data.wars) {
    const w = data.wars;
    items.push(
      { label: 'Guerre', value: String(w.total), note: `${w.victories} vinte · ${w.draws} pari · ${w.defeats} perse` },
      { label: 'Stelle a guerra', value: formatNumber(w.averageStars, 2), note: `${formatNumber(w.stars)} stelle in tutto` },
      { label: 'Distruzione media', value: `${formatNumber(w.averageDestruction, 1)}%` },
      { label: 'Attacchi a tre stelle', value: `${formatNumber(w.threeStarRate, 1)}%`, note: `su ${formatNumber(w.attacksUsed)} attacchi` },
      {
        label: 'Attacchi mancati',
        value: String(w.attacksMissed),
        accent: w.attacksMissed > 0 ? T.danger : T.good,
        note: w.attacksMissed > 0 ? 'ogni attacco conta' : 'nessuno: tutti presenti!',
      },
    );
  }
  if (data.raids) {
    items.push({
      label: 'Oro della capitale',
      value: formatNumber(data.raids.capitalGold),
      note: `${data.raids.weekends} Raid Weekend · ${formatNumber(data.raids.attacks)} attacchi`,
    });
  }
  if (!items.length) return emptyNote(text, 'Nessuna guerra né Raid Weekend questo mese');
  const grid = tiles(text, items, CONTENT_TOP + 20);
  const mvp = data.mvp
    ? champion(text, grid.bottom + 36, 'Migliore del mese', [data.mvp.name], `${formatNumber(data.mvp.averageStars, 2)} stelle a guerra in ${data.mvp.wars} guerre`)
    : '';
  return grid.svg + mvp;
}

function cwlBody(text: SvgText, data: CwlData): string {
  const items: Tile[] = [
    { label: 'Posizione', value: data.rank !== null ? `${data.rank}°` : '–', note: `su ${data.clans} clan`, accent: data.rank === 1 ? T.good : undefined },
    { label: 'Stelle', value: formatNumber(data.stars), note: 'con i bonus delle vittorie' },
    { label: 'Vittorie', value: String(data.wins), accent: T.good },
    { label: 'Pareggi e sconfitte', value: `${data.draws} · ${data.losses}` },
  ];
  const grid = tiles(text, items, CONTENT_TOP + 20);
  const best = data.bestAttackers;
  const mvp = best?.names.length
    ? champion(
        text,
        grid.bottom + 40,
        best.names.length > 1 ? 'Migliori attaccanti' : 'Migliore attaccante',
        best.names,
        `${best.stars} stelle in ${best.attacks} attacchi${best.names.length > 1 ? ' ciascuno' : ''}`,
      )
    : '';
  return grid.svg + mvp;
}

function donationsBody(text: SvgText, data: DonationsData): string {
  const grid = tiles(text, [{ label: 'Truppe donate', value: formatNumber(data.total), note: 'in tutta la stagione' }], CONTENT_TOP + 20);
  let svg = grid.svg;
  let y = grid.bottom + 40;
  const medals = [T.goldText, T.text, T.gold];
  data.top.forEach((player, i) => {
    const rowHeight = 92;
    svg += `<rect x="${LEFT}" y="${y}" width="${RIGHT - LEFT}" height="${rowHeight - 14}" rx="12" fill="${i % 2 ? T.plate : T.tile}" fill-opacity="0.85" stroke="${T.edge}" stroke-width="2"/>`;
    svg += text.draw(`${i + 1}°`, { font: 'title', size: 40, x: LEFT + 34, y: y + 54, fill: medals[i] ?? T.muted });
    svg += text.draw(player.name, { font: 'semibold', size: 34, x: LEFT + 120, y: y + 52, fill: T.text, maxWidth: 520, minSize: 22 });
    svg += text.draw(formatNumber(player.donations), { font: 'title', size: 38, x: RIGHT - 34, y: y + 54, fill: T.goldText, anchor: 'end' });
    y += rowHeight;
  });
  return svg;
}

async function recordBody(text: SvgText, data: RecordData): Promise<string> {
  const middle = W / 2;
  if (data.record === 'cwlLeague') {
    const trophy = await picture(warLeagueFile(data.leagueName) ?? '', 360);
    const previous =
      data.previousLeagueName && data.previousLeagueName !== data.leagueName
        ? `Prima: ${data.previousLeagueName}`
        : 'La lega più alta mai raggiunta';
    return [
      image(trophy, middle - 170, CONTENT_TOP + 30, 340),
      text.draw(data.leagueName ?? '', { font: 'title', size: 66, x: middle, y: CONTENT_TOP + 470, fill: T.goldText, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 40 }),
      text.draw(previous, { font: 'regular', size: 32, x: middle, y: CONTENT_TOP + 540, fill: T.muted, anchor: 'middle', maxWidth: RIGHT - LEFT }),
    ].join('');
  }
  const ranking = data.record === 'localRank' || data.record === 'localCapitalRank';
  const value = ranking ? `${data.value}°` : formatNumber(data.value);
  const unit: Record<RecordData['record'], string> = {
    perfectWars: 'guerre vinte con tutte le stelle',
    warWinStreak: 'guerre vinte di fila',
    cwlLeague: '',
    localRank: 'posto nella classifica dei clan in Italia',
    localCapitalRank: 'posto nella classifica della capitale in Italia',
    capitalPoints: 'trofei della capitale',
  };
  const previous =
    data.previous === null || data.previous === 0
      ? 'Mai così in alto'
      : `Il record precedente: ${ranking ? `${data.previous}°` : formatNumber(data.previous)}`;
  return [
    `<circle cx="${middle}" cy="${CONTENT_TOP + 270}" r="230" fill="${T.plate}" fill-opacity="0.85" stroke="${T.gold}" stroke-width="4"/>`,
    `<circle cx="${middle}" cy="${CONTENT_TOP + 270}" r="206" fill="none" stroke="${T.gold}" stroke-width="1.5" stroke-opacity="0.7"/>`,
    text.draw(value, { font: 'display', size: 200, x: middle, y: CONTENT_TOP + 270, fill: T.goldText, anchor: 'middle', maxWidth: 360, minSize: 90, centered: true }),
    text.draw(unit[data.record], { font: 'title', size: 40, x: middle, y: CONTENT_TOP + 600, fill: T.text, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 26 }),
    text.draw(previous, { font: 'regular', size: 30, x: middle, y: CONTENT_TOP + 660, fill: T.muted, anchor: 'middle', maxWidth: RIGHT - LEFT }),
  ].join('');
}

/**
 * The commendations, one row each (medal, name, tier, players), on as many pages as needed.
 * `page(n)` draws the frame of the n-th page (1-based); the rows are added to it.
 */
async function honourPages(text: SvgText, honours: Honour[], page: (n: number) => string): Promise<string[]> {
  if (!honours.length) return [];
  const medalSize = 96;
  const namesLeft = LEFT + medalSize + 32;
  const namesWidth = RIGHT - namesLeft - 16;
  const lineHeight = 38;
  const pages: string[][] = [[]];
  let y = CONTENT_TOP + 20;
  for (const honour of honours) {
    const names = honour.players.map((p) => (p.times > 1 ? `${p.name} ×${p.times}` : p.name));
    const lines = text.wrap(names, 'regular', 28, namesWidth);
    const height = Math.max(medalSize + 16, 64 + lines.length * lineHeight);
    if (y + height > CONTENT_BOTTOM && pages.at(-1)!.length) {
      pages.push([]);
      y = CONTENT_TOP + 20;
    }
    const medal = await picture(`commendations/${honour.type}-${honour.tier}.svg`, 2 * medalSize);
    const rows = pages.at(-1)!;
    rows.push(
      [
        image(medal, LEFT, y, medalSize),
        text.draw(COMMENDATION_LABELS[honour.type][honour.tier] ?? honour.type, {
          font: 'title',
          size: 34,
          x: namesLeft,
          y: y + 36,
          fill: T.goldText,
          maxWidth: namesWidth - 170,
          minSize: 24,
        }),
        text.draw(TIER_LABELS[honour.tier].toUpperCase(), { font: 'semibold', size: 20, x: RIGHT - 16, y: y + 34, fill: T.muted, anchor: 'end' }),
        ...lines.map((line, i) =>
          text.draw(line, { font: 'regular', size: 28, x: namesLeft, y: y + 80 + i * lineHeight, fill: T.text }),
        ),
        `<rect x="${namesLeft}" y="${y + height - 2}" width="${RIGHT - namesLeft}" height="1.5" fill="${T.line}"/>`,
      ].join(''),
    );
    y += height + 16;
  }
  return pages.map((rows, i) => page(i + 1).replace('</svg>', `${rows.join('')}</svg>`));
}
