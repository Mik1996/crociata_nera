import sharp from 'sharp';
import { readSiteAsset } from '@/lib/assets/site-assets';
import { AnnouncementData, CwlData, DonationsData, Honour, LegendSeasonData, MonthData, PromotionData, RecordData } from '../announcement-data';
import { AnnouncementLanguage, AnnouncementTexts, announcementTexts } from '../announcement-texts';
import { promotionLook, seededRandom } from './promotion-look';
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
      .then((data) =>
        // Never enlarged: a small picture drawn bigger looks pixelated (SVGs are rasterised at 300 dpi).
        sharp(data, { density: 300 }).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).png().toBuffer(),
      )
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

/** Colours of the frame of a page: the gold iron of every announcement, or a league's (promotions). */
interface FrameLook {
  frame: string;
  frameLight: string;
  kicker: string;
  title: string;
  vignette: string;
  vignetteOpacity: number;
  ember: string;
  emberOpacity: number;
}

const IRON_LOOK: FrameLook = {
  frame: T.gold,
  frameLight: T.goldText,
  kicker: T.gold,
  title: T.goldText,
  vignette: T.crimson,
  vignetteOpacity: 0.55,
  ember: T.ember,
  emberOpacity: 0.38,
};

/** Extra layers of a page: `defs`, a backdrop drawn under the frame and the texts, ornaments over the frame. */
interface PageLayers {
  defs?: string;
  backdrop?: string;
  ornaments?: string;
  headerShift?: number;
}

interface Header {
  /** Small line above the title (the clan). */
  kicker: string;
  title: string;
  subtitle: string;
}

/** Draws the pages of an announcement (SVG), in a language (Italian, the channel's, by default). */
export async function announcementSvgs(data: AnnouncementData, language?: AnnouncementLanguage): Promise<string[]> {
  const text = await SvgText.create();
  const t = announcementTexts(language);
  const h = t.image.honours;
  const crest = await picture(CREST_OF[data.clanTag] ?? DEFAULT_CREST, 300);
  const page = (header: Header, body: string) => framePage(text, crest, header, body);

  switch (data.kind) {
    case 'month':
      return [
        page({ kicker: data.clanName, title: t.month(data.month), subtitle: t.image.month.subtitle }, monthBody(text, t, data)),
        ...(await honourPages(text, t, data.honours, (n) =>
          page({ kicker: data.clanName, title: h.title, subtitle: pageSubtitle(t.month(data.month), n) }, ''),
        )),
      ].slice(0, MAX_PAGES);
    case 'cwl':
      return [
        page({ kicker: data.clanName, title: t.image.cwl.title, subtitle: t.month(data.season) }, cwlBody(text, t, data)),
        ...(await honourPages(text, t, data.honours, (n) =>
          page({ kicker: data.clanName, title: h.title, subtitle: pageSubtitle(h.cwl(t.month(data.season)), n) }, ''),
        )),
      ].slice(0, MAX_PAGES);
    case 'donations':
      return [
        page({ kicker: data.clanName, title: t.image.donations.title, subtitle: t.image.donations.season(t.month(data.season)) }, donationsBody(text, t, data)),
        ...(await honourPages(text, t, data.honours, (n) =>
          page({ kicker: data.clanName, title: h.title, subtitle: pageSubtitle(h.donations(t.month(data.season)), n) }, ''),
        )),
      ].slice(0, MAX_PAGES);
    case 'record':
      return [page({ kicker: data.clanName, title: t.image.record.title, subtitle: t.records[data.record] }, await recordBody(text, t, data))];
    case 'promotion':
      return [await promotionPage(text, t, crest, data)];
    case 'legendSeason':
      return [await legendSeasonPage(text, t, crest, data)];
  }
}

const pageSubtitle = (label: string, n: number) => (n > 1 ? `${label} · ${n}` : label);

/** Draws the pages of an announcement as JPEG files. */
export async function renderAnnouncementImages(data: AnnouncementData, language?: AnnouncementLanguage): Promise<Buffer[]> {
  const svgs = await announcementSvgs(data, language);
  return Promise.all(svgs.map(renderSvg));
}

/** Draws one page (0-based); `null` beyond the last. */
export async function renderAnnouncementImage(data: AnnouncementData, page: number, language?: AnnouncementLanguage): Promise<Buffer | null> {
  const svg = (await announcementSvgs(data, language))[page];
  return svg ? renderSvg(svg) : null;
}

function renderSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
}

// --- frame -------------------------------------------------------------------

function framePage(
  text: SvgText,
  crest: string | null,
  header: Header,
  body: string,
  look: FrameLook = IRON_LOOK,
  layers: PageLayers = {},
): string {
  const kickerY = layers.headerShift ? 268 + layers.headerShift : 268;
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
    <stop offset="0.55" stop-color="${look.vignette}" stop-opacity="0"/><stop offset="1" stop-color="${look.vignette}" stop-opacity="${look.vignetteOpacity}"/>
  </radialGradient>
  <radialGradient id="ember" cx="0.5" cy="1" r="0.6">
    <stop offset="0" stop-color="${look.ember}" stop-opacity="${look.emberOpacity}"/><stop offset="1" stop-color="${look.ember}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="stud" cx="0.35" cy="0.35" r="0.7">
    <stop offset="0" stop-color="${look.frameLight}"/><stop offset="0.6" stop-color="${look.frame}"/><stop offset="1" stop-color="${T.edge}"/>
  </radialGradient>
  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${look.frame}" stop-opacity="0"/><stop offset="0.5" stop-color="${look.frame}"/><stop offset="1" stop-color="${look.frame}" stop-opacity="0"/>
  </linearGradient>
  ${layers.defs ?? ''}
</defs>
<rect width="${W}" height="${H}" fill="${T.background}"/>
<rect width="${W}" height="${H}" fill="url(#plate)"/>
<rect width="${W}" height="${H}" filter="url(#brushed)"/>
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
<rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#ember)"/>
${layers.backdrop ?? ''}
<rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${look.frame}" stroke-width="6"/>
<rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="${look.frame}" stroke-width="2" stroke-opacity="0.8"/>
${studs}
${layers.ornaments ?? ''}
${image(crest, W / 2 - 75, 68, 150)}
${text.draw(header.kicker.toUpperCase(), { font: 'title', size: 34, x: W / 2, y: kickerY, fill: look.kicker, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 24 })}
${text.draw(header.title, { font: 'display', size: 76, x: W / 2, y: 352, fill: look.title, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 44 })}
${text.draw(header.subtitle, { font: 'semibold', size: 30, x: W / 2, y: 398, fill: T.muted, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 22 })}
<rect x="${LEFT}" y="420" width="${RIGHT - LEFT}" height="3" fill="url(#rule)"/>
<rect x="${W / 2 - 160}" y="427" width="320" height="2" fill="${look.ember}" fill-opacity="0.7"/>
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

function monthBody(text: SvgText, t: AnnouncementTexts, data: MonthData): string {
  const m = t.image.month;
  const formatNumber = t.number;
  const items: Tile[] = [];
  if (data.wars) {
    const w = data.wars;
    items.push(
      { label: m.wars, value: String(w.total), note: m.warsNote(w.victories, w.draws, w.defeats) },
      { label: m.starsPerWar, value: formatNumber(w.averageStars, 2), note: m.starsNote(formatNumber(w.stars)) },
      { label: m.destruction, value: `${formatNumber(w.averageDestruction, 1)}%` },
      { label: m.threeStars, value: `${formatNumber(w.threeStarRate, 1)}%`, note: m.threeStarsNote(formatNumber(w.attacksUsed)) },
      {
        label: m.missed,
        value: String(w.attacksMissed),
        accent: w.attacksMissed > 0 ? T.danger : T.good,
        note: w.attacksMissed > 0 ? m.missedSome : m.missedNone,
      },
    );
  }
  if (data.raids) {
    items.push({
      label: m.capitalGold,
      value: formatNumber(data.raids.capitalGold),
      note: m.capitalGoldNote(data.raids.weekends, formatNumber(data.raids.attacks)),
    });
  }
  if (!items.length) return emptyNote(text, m.empty);
  const grid = tiles(text, items, CONTENT_TOP + 20);
  const mvp = data.mvp
    ? champion(text, grid.bottom + 36, m.best, [data.mvp.name], m.bestNote(formatNumber(data.mvp.averageStars, 2), data.mvp.wars))
    : '';
  return grid.svg + mvp;
}

function cwlBody(text: SvgText, t: AnnouncementTexts, data: CwlData): string {
  const c = t.image.cwl;
  const items: Tile[] = [
    { label: c.place, value: data.rank !== null ? t.place(data.rank) : '–', note: c.placeNote(data.clans), accent: data.rank === 1 ? T.good : undefined },
    { label: c.stars, value: t.number(data.stars), note: c.starsNote },
    { label: c.wins, value: String(data.wins), accent: T.good },
    { label: c.drawsAndLosses, value: `${data.draws} · ${data.losses}` },
  ];
  const grid = tiles(text, items, CONTENT_TOP + 20);
  const best = data.bestAttackers;
  const mvp = best?.names.length
    ? champion(
        text,
        grid.bottom + 40,
        c.best(best.names.length),
        best.names,
        c.bestNote(best.stars, best.attacks, best.names.length > 1),
      )
    : '';
  return grid.svg + mvp;
}

function donationsBody(text: SvgText, t: AnnouncementTexts, data: DonationsData): string {
  const formatNumber = t.number;
  const grid = tiles(text, [{ label: t.image.donations.troops, value: formatNumber(data.total), note: t.image.donations.troopsNote }], CONTENT_TOP + 20);
  let svg = grid.svg;
  let y = grid.bottom + 40;
  const medals = [T.goldText, T.text, T.gold];
  data.top.forEach((player, i) => {
    const rowHeight = 92;
    svg += `<rect x="${LEFT}" y="${y}" width="${RIGHT - LEFT}" height="${rowHeight - 14}" rx="12" fill="${i % 2 ? T.plate : T.tile}" fill-opacity="0.85" stroke="${T.edge}" stroke-width="2"/>`;
    svg += text.draw(t.place(i + 1), { font: 'title', size: 40, x: LEFT + 34, y: y + 54, fill: medals[i] ?? T.muted });
    svg += text.draw(player.name, { font: 'semibold', size: 34, x: LEFT + 120, y: y + 52, fill: T.text, maxWidth: 520, minSize: 22 });
    svg += text.draw(formatNumber(player.donations), { font: 'title', size: 38, x: RIGHT - 34, y: y + 54, fill: T.goldText, anchor: 'end' });
    y += rowHeight;
  });
  return svg;
}

async function recordBody(text: SvgText, t: AnnouncementTexts, data: RecordData): Promise<string> {
  const middle = W / 2;
  const r = t.image.record;
  if (data.record === 'cwlLeague') {
    const trophy = await picture(warLeagueFile(data.leagueName) ?? '', 360);
    const previous =
      data.previousLeagueName && data.previousLeagueName !== data.leagueName
        ? r.leagueBefore(t.league(data.previousLeagueName))
        : r.leagueHighest;
    return [
      image(trophy, middle - 170, CONTENT_TOP + 30, 340),
      text.draw(t.league(data.leagueName ?? ''), { font: 'title', size: 66, x: middle, y: CONTENT_TOP + 470, fill: T.goldText, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 40 }),
      text.draw(previous, { font: 'regular', size: 32, x: middle, y: CONTENT_TOP + 540, fill: T.muted, anchor: 'middle', maxWidth: RIGHT - LEFT }),
    ].join('');
  }
  const ranking = data.record === 'localRank' || data.record === 'localCapitalRank';
  const value = ranking ? t.place(data.value) : t.number(data.value);
  const previous =
    data.previous === null || data.previous === 0
      ? r.never
      : r.previous(ranking ? t.place(data.previous) : t.number(data.previous));
  return [
    `<circle cx="${middle}" cy="${CONTENT_TOP + 270}" r="230" fill="${T.plate}" fill-opacity="0.85" stroke="${T.gold}" stroke-width="4"/>`,
    `<circle cx="${middle}" cy="${CONTENT_TOP + 270}" r="206" fill="none" stroke="${T.gold}" stroke-width="1.5" stroke-opacity="0.7"/>`,
    text.draw(value, { font: 'display', size: 200, x: middle, y: CONTENT_TOP + 270, fill: T.goldText, anchor: 'middle', maxWidth: 360, minSize: 90, centered: true }),
    text.draw(r.units[data.record], { font: 'title', size: 40, x: middle, y: CONTENT_TOP + 600, fill: T.text, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 26 }),
    text.draw(previous, { font: 'regular', size: 30, x: middle, y: CONTENT_TOP + 660, fill: T.muted, anchor: 'middle', maxWidth: RIGHT - LEFT }),
  ].join('');
}

/**
 * The commendations, one row each (medal, name, tier, players), on as many pages as needed.
 * `page(n)` draws the frame of the n-th page (1-based); the rows are added to it.
 */
async function honourPages(text: SvgText, t: AnnouncementTexts, honours: Honour[], page: (n: number) => string): Promise<string[]> {
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
        text.draw(t.commendations[honour.type][honour.tier] ?? honour.type, {
          font: 'title',
          size: 34,
          x: namesLeft,
          y: y + 36,
          fill: T.goldText,
          maxWidth: namesWidth - 170,
          minSize: 24,
        }),
        text.draw(t.tiers[honour.tier].toUpperCase(), { font: 'semibold', size: 20, x: RIGHT - 16, y: y + 34, fill: T.muted, anchor: 'end' }),
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

// --- promotions --------------------------------------------------------------

/** Centre of the league badge on a promotion page. */
const BADGE_X = W / 2;
const BADGE_Y = CONTENT_TOP + 245;

/**
 * A player promoted to a league: the iron frame in the colours of the league, the badge in the
 * middle of a glow, rays, rings and lightning (Electro) or embers and flames (Legend), more of them
 * at every league up to Legend League I.
 */
async function promotionPage(text: SvgText, t: AnnouncementTexts, crest: string | null, data: PromotionData): Promise<string> {
  const look = promotionLook(data.league.id);
  const { level, accent, light, deep } = look;
  const random = seededRandom(data.league.id);
  const top = level === 6;
  const frame: FrameLook = {
    frame: top ? T.legendLight : accent,
    frameLight: light,
    kicker: accent,
    title: light,
    vignette: deep,
    vignetteOpacity: Math.min(0.95, 0.55 + level * 0.07),
    ember: accent,
    emberOpacity: Math.min(0.75, 0.3 + level * 0.07),
  };

  const defs = `
  <radialGradient id="badgeGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${light}" stop-opacity="${Math.min(0.9, 0.45 + level * 0.08)}"/>
    <stop offset="0.45" stop-color="${accent}" stop-opacity="${Math.min(0.6, 0.25 + level * 0.06)}"/>
    <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
  </radialGradient>
  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${4 + level}"/></filter>
  <clipPath id="inside"><rect x="48" y="48" width="${W - 96}" height="${H - 96}"/></clipPath>
  <clipPath id="content"><rect x="48" y="${CONTENT_TOP - 8}" width="${W - 96}" height="${1236 - CONTENT_TOP}"/></clipPath>`;

  const layers: string[] = [];
  /** Rays and glow stay below the header. */
  const centred: string[] = [];
  // Rays from the badge (from Electro League 32).
  const rays = [0, 12, 16, 20, 26, 36][level - 1]!;
  const rayLength = 620 + level * 40;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + (level % 2) * 0.13;
    const spread = 0.035 + level * 0.004;
    const point = (a: number, r: number) => `${(BADGE_X + Math.cos(a) * r).toFixed(1)},${(BADGE_Y + Math.sin(a) * r).toFixed(1)}`;
    centred.push(
      `<polygon points="${point(angle - spread, 60)} ${point(angle, rayLength)} ${point(angle + spread, 60)}" fill="${light}" fill-opacity="${(0.04 + level * 0.018).toFixed(3)}"/>`,
    );
  }
  // Glow behind the badge.
  const glowRadius = 250 + level * 28;
  centred.push(`<circle cx="${BADGE_X}" cy="${BADGE_Y}" r="${glowRadius}" fill="url(#badgeGlow)"/>`);
  // Sparks (blue) or embers (orange), rising from the bottom.
  const sparks = level * (look.family === 'legend' ? 22 : 12);
  for (let i = 0; i < sparks; i++) {
    const x = 70 + random() * (W - 140);
    const y = CONTENT_TOP - 120 + random() * (H - CONTENT_TOP);
    const r = 1.2 + random() * (look.family === 'legend' ? 3.4 : 2.4);
    const color = random() < 0.5 ? light : accent;
    layers.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="${(0.35 + random() * 0.6).toFixed(2)}"/>`);
  }
  if (look.family === 'electro') {
    // Lightning bolts on both sides of the badge (never over the title or the name): 2, 4, 6.
    const bolts = level * 2;
    for (let i = 0; i < bolts; i++) {
      const side = i % 2 ? Math.PI : 0;
      const row = Math.floor(i / 2);
      const angle = side + (row - (level - 1) / 2) * 0.42 + (random() - 0.5) * 0.12;
      const path: string[] = [];
      for (let step = 0; step <= 5; step++) {
        const r = 225 + step * 24;
        const a = angle + (step % 2 ? 0.07 : -0.07) * (0.6 + random());
        path.push(`${(BADGE_X + Math.cos(a) * r).toFixed(1)},${(BADGE_Y + Math.sin(a) * r).toFixed(1)}`);
      }
      const points = path.join(' ');
      layers.push(
        `<polyline points="${points}" fill="none" stroke="${accent}" stroke-width="${6 + level * 2}" stroke-linejoin="round" stroke-opacity="0.8" filter="url(#softGlow)"/>`,
        `<polyline points="${points}" fill="none" stroke="${light}" stroke-width="${2 + level * 0.6}" stroke-linejoin="round"/>`,
      );
    }
  } else {
    // Flames around the badge: a crown of tongues, longer at every Legend league.
    const tongues = 18 + (level - 4) * 8;
    for (let i = 0; i < tongues; i++) {
      const angle = (i / tongues) * Math.PI * 2;
      const inner = 205;
      const outer = inner + 40 + (level - 3) * 18 + random() * 30;
      const p = (a: number, r: number) => `${(BADGE_X + Math.cos(a) * r).toFixed(1)},${(BADGE_Y + Math.sin(a) * r).toFixed(1)}`;
      const width = Math.PI / tongues;
      layers.push(
        `<path d="M${p(angle - width, inner)} Q${p(angle - width * 0.2, (inner + outer) / 2)} ${p(angle + width * 0.3, outer)} Q${p(angle + width * 0.4, (inner + outer) / 2)} ${p(angle + width, inner)} Z" fill="${i % 2 ? accent : light}" fill-opacity="${(0.55 + level * 0.05).toFixed(2)}" filter="url(#softGlow)"/>`,
      );
    }
  }
  // Rings: one from Electro League 32, two from Legend League III, three at Legend League I.
  if (level >= 2) layers.push(`<circle cx="${BADGE_X}" cy="${BADGE_Y}" r="200" fill="none" stroke="${accent}" stroke-width="4"/>`);
  if (level >= 4) layers.push(`<circle cx="${BADGE_X}" cy="${BADGE_Y}" r="186" fill="none" stroke="${light}" stroke-width="1.5" stroke-dasharray="6 8"/>`);
  if (top) {
    layers.push(`<circle cx="${BADGE_X}" cy="${BADGE_Y}" r="214" fill="none" stroke="${T.goldText}" stroke-width="2.5"/>`);
    // Four-pointed stars scattered in the glow.
    for (let i = 0; i < 14; i++) {
      const a = random() * Math.PI * 2;
      const r = 235 + random() * 110;
      const x = BADGE_X + Math.cos(a) * r;
      const y = BADGE_Y + Math.sin(a) * r * 0.75;
      const s = 8 + random() * 14;
      centred.push(
        `<path d="M${x},${y - s} L${x + s * 0.25},${y - s * 0.25} L${x + s},${y} L${x + s * 0.25},${y + s * 0.25} L${x},${y + s} L${x - s * 0.25},${y + s * 0.25} L${x - s},${y} L${x - s * 0.25},${y - s * 0.25} Z" fill="${T.goldText}" fill-opacity="${(0.6 + random() * 0.4).toFixed(2)}"/>`,
      );
    }
  }
  const backdrop = `<g clip-path="url(#content)">${centred.join('')}</g><g clip-path="url(#inside)">${layers.join('')}</g>`;

  // The large badge of the API (308×326), drawn at its own size: sharp at every league.
  const badge = await picture(`game/league-tiers/large/${data.league.id}.png`, 326);
  const badgeSize = 326;
  const body = [
    image(badge, BADGE_X - badgeSize / 2, BADGE_Y - badgeSize / 2, badgeSize),
    legendDivision(data.league.name, BADGE_X - badgeSize / 2, BADGE_Y - badgeSize / 2, badgeSize),
    text.draw(data.playerName, { font: 'bold', size: 76, x: W / 2, y: CONTENT_TOP + 575, fill: T.text, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 40 }),
    text.draw(t.image.promotion.reaches(t.league(data.league.name)).toUpperCase(), { font: 'title', size: 42, x: W / 2, y: CONTENT_TOP + 640, fill: light, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 28 }),
  ].join('');

  const p = t.image.promotion;
  const title = p.title;
  const subtitle = top ? p.top : look.family === 'legend' ? p.legend : p.electro;
  return framePage(text, crest, { kicker: data.clanName, title, subtitle }, body, frame, { defs, backdrop });
}

/**
 * The division of a Legend league (III, II, I) as the game shows it: a black rounded box with
 * white bars at the bottom right of the badge. The API gives the three leagues the same picture;
 * the box is drawn over it (the picture itself is not changed). Nothing for the other leagues, whose
 * number is part of their picture.
 */
function legendDivision(leagueName: string, x: number, y: number, size: number): string {
  const division = /^Legend League (I{1,3})$/.exec(leagueName)?.[1]?.length ?? 0;
  if (!division) return '';
  // The same square box for the three divisions; the bars narrow to fit inside it.
  const side = size * 0.24;
  const pad = side * 0.2;
  const gap = side * 0.09;
  const inner = side - pad * 2;
  const barWidth = Math.min(side * 0.14, (inner - (division - 1) * gap) / division);
  const barsWidth = division * barWidth + (division - 1) * gap;
  const boxX = x + size * 0.8 - side / 2;
  const boxY = y + size * 0.86 - side / 2;
  const bars = Array.from({ length: division }, (_, i) => {
    const barX = boxX + (side - barsWidth) / 2 + i * (barWidth + gap);
    return `<rect x="${barX.toFixed(1)}" y="${(boxY + pad).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${inner.toFixed(1)}" rx="${(barWidth * 0.2).toFixed(1)}" fill="${T.divisionNumeral}"/>`;
  }).join('');
  return [
    `<rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" rx="${(side * 0.18).toFixed(1)}" fill="${T.divisionBox}" stroke="${T.divisionEdge}" stroke-width="2"/>`,
    bars,
  ].join('');
}

// --- end of a Legend League season --------------------------------------------

/** Centre of the Legend League I badge on the season page. */
const CROWN_X = W / 2;
const CROWN_Y = CONTENT_TOP + 168;

/**
 * The most epic of the pictures: a member who ended a Legend League season among the first 10,000 of
 * the world. Gold and crimson: a triple gold frame with ornaments in the corners, a golden sunburst,
 * the Legend League I badge in a laurel wreath, the name glowing, and three medallions (trophies,
 * country position with its flag, world position with a globe).
 */
async function legendSeasonPage(text: SvgText, t: AnnouncementTexts, crest: string | null, data: LegendSeasonData): Promise<string> {
  const random = seededRandom(data.trophies + data.worldRank);
  const s = t.image.legendSeason;
  const frame: FrameLook = {
    frame: T.goldText,
    frameLight: T.legendLight,
    kicker: T.gold,
    title: T.legendLight,
    vignette: T.crimson,
    vignetteOpacity: 0.95,
    ember: T.legend,
    emberOpacity: 0.7,
  };

  const defs = `
  <radialGradient id="crownGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${T.legendLight}" stop-opacity="0.95"/>
    <stop offset="0.35" stop-color="${T.gold}" stop-opacity="0.6"/>
    <stop offset="1" stop-color="${T.legend}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="goldLeaf" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${T.legendLight}"/><stop offset="0.5" stop-color="${T.goldText}"/><stop offset="1" stop-color="${T.edge}"/>
  </linearGradient>
  <linearGradient id="medal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${T.tile}"/><stop offset="1" stop-color="${T.background}"/>
  </linearGradient>
  <filter id="nameGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  <clipPath id="content"><rect x="56" y="${CONTENT_TOP - 8}" width="${W - 112}" height="${1228 - CONTENT_TOP}"/></clipPath>
  <clipPath id="inside"><rect x="56" y="56" width="${W - 112}" height="${H - 112}"/></clipPath>`;

  const point = (a: number, r: number) => `${(CROWN_X + Math.cos(a) * r).toFixed(1)},${(CROWN_Y + Math.sin(a) * r).toFixed(1)}`;
  const centred: string[] = [];
  // Golden sunburst: 48 rays, alternately gold and fire.
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const spread = i % 2 ? 0.03 : 0.05;
    centred.push(
      `<polygon points="${point(angle - spread, 50)} ${point(angle, 900)} ${point(angle + spread, 50)}" fill="${i % 2 ? T.legend : T.legendLight}" fill-opacity="${i % 2 ? 0.1 : 0.16}"/>`,
    );
  }
  centred.push(`<circle cx="${CROWN_X}" cy="${CROWN_Y}" r="330" fill="url(#crownGlow)"/>`);

  const layers: string[] = [];
  // Gold dust over the whole page.
  for (let i = 0; i < 150; i++) {
    const x = 70 + random() * (W - 140);
    const y = 70 + random() * (H - 140);
    const r = 0.8 + random() * 3;
    layers.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${random() < 0.6 ? T.legendLight : T.legend}" fill-opacity="${(0.3 + random() * 0.6).toFixed(2)}"/>`);
  }
  const backdrop = `<g clip-path="url(#content)">${centred.join('')}</g><g clip-path="url(#inside)">${layers.join('')}</g>`;

  // Laurel wreath around the badge: two branches of gold leaves, open at the top.
  const wreath: string[] = [];
  const wreathRadius = 188;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 13; i++) {
      // From the bottom (90°) up to the top (≈ -60°) on each side.
      const angle = Math.PI / 2 + side * (0.18 + i * 0.2);
      const x = CROWN_X + Math.cos(angle) * wreathRadius;
      const y = CROWN_Y + Math.sin(angle) * wreathRadius;
      const tangent = (angle * 180) / Math.PI + (side > 0 ? 90 : -90);
      const size = 0.9 - i * 0.022;
      for (const offset of [-28, 28]) {
        wreath.push(
          `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(30 * size).toFixed(1)}" ry="${(11 * size).toFixed(1)}" fill="url(#goldLeaf)" stroke="${T.edge}" stroke-width="1.2" transform="rotate(${(tangent + offset * side).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}) translate(${(side * 22 * size).toFixed(1)} 0)"/>`,
        );
      }
    }
  }
  // The ribbon tying the two branches.
  wreath.push(
    `<path d="M${CROWN_X - 34},${CROWN_Y + wreathRadius} L${CROWN_X + 34},${CROWN_Y + wreathRadius} L${CROWN_X + 48},${CROWN_Y + wreathRadius + 28} L${CROWN_X + 20},${CROWN_Y + wreathRadius + 18} L${CROWN_X},${CROWN_Y + wreathRadius + 32} L${CROWN_X - 20},${CROWN_Y + wreathRadius + 18} L${CROWN_X - 48},${CROWN_Y + wreathRadius + 28} Z" fill="${T.crimson}" stroke="${T.goldText}" stroke-width="2.5"/>`,
  );

  const badge = await picture('game/league-tiers/large/105000036.png', 326);
  const badgeSize = 268;
  const badgeX = CROWN_X - badgeSize / 2;
  const badgeY = CROWN_Y - badgeSize / 2;

  // Name, glowing.
  const nameY = CONTENT_TOP + 470;
  const name = [
    `<g filter="url(#nameGlow)" opacity="0.9">${text.draw(data.playerName, { font: 'bold', size: 84, x: W / 2, y: nameY, fill: T.legend, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 42 })}</g>`,
    text.draw(data.playerName, { font: 'bold', size: 84, x: W / 2, y: nameY, fill: T.text, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 42 }),
    text.draw(s.top.toUpperCase(), { font: 'title', size: 30, x: W / 2, y: nameY + 50, fill: T.legendLight, anchor: 'middle', maxWidth: RIGHT - LEFT, minSize: 22 }),
  ].join('');

  // Medallions.
  const flag = data.countryRank !== null && data.countryCode ? await picture(`flags/${data.countryCode.toLowerCase()}.svg`, 160) : null;
  const medals: { icon: string; value: string; label: string }[] = [
    { icon: 'trophy', value: t.number(data.trophies), label: s.trophies },
    ...(data.countryRank !== null && data.countryCode
      ? [{ icon: 'flag', value: t.place(data.countryRank), label: s.country(t.country(data.countryCode)) }]
      : []),
    { icon: 'globe', value: t.place(data.worldRank), label: s.world },
  ];
  const medalTop = nameY + 74;
  const medalHeight = 200;
  const gap = 24;
  const medalWidth = (RIGHT - LEFT - gap * (medals.length - 1)) / medals.length;
  const medalSvg = medals
    .map((medal, i) => {
      const x = LEFT + i * (medalWidth + gap);
      const cx = x + medalWidth / 2;
      const iconY = medalTop + 56;
      const icon =
        medal.icon === 'trophy'
          ? trophyIcon(cx, iconY)
          : medal.icon === 'globe'
            ? globeIcon(cx, iconY)
            : flag
              ? `<rect x="${cx - 39}" y="${iconY - 27}" width="78" height="54" rx="6" fill="${T.background}"/><image href="${flag}" x="${cx - 36}" y="${iconY - 24}" width="72" height="48" preserveAspectRatio="none"/>`
              : '';
      return [
        `<rect x="${x}" y="${medalTop}" width="${medalWidth}" height="${medalHeight}" rx="22" fill="url(#medal)" stroke="${T.goldText}" stroke-width="3"/>`,
        `<rect x="${x + 8}" y="${medalTop + 8}" width="${medalWidth - 16}" height="${medalHeight - 16}" rx="16" fill="none" stroke="${T.gold}" stroke-width="1.2" stroke-opacity="0.7"/>`,
        icon,
        text.draw(medal.value, { font: 'title', size: 52, x: cx, y: medalTop + 142, fill: T.legendLight, anchor: 'middle', maxWidth: medalWidth - 30, minSize: 30 }),
        text.draw(medal.label.toUpperCase(), { font: 'semibold', size: 20, x: cx, y: medalTop + 178, fill: T.muted, anchor: 'middle', maxWidth: medalWidth - 30, minSize: 14 }),
      ].join('');
    })
    .join('');

  // Ornaments in the corners of the frame (over it): gold scrolls with a ruby.
  const corner = (x: number, y: number, sx: number, sy: number) =>
    `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">
      <path d="M0,0 L120,0 Q70,10 58,58 Q10,70 0,120 Z" fill="${T.gold}" fill-opacity="0.9" stroke="${T.legendLight}" stroke-width="2"/>
      <path d="M18,18 L92,18 Q60,26 50,50 Q26,60 18,92 Z" fill="${T.background}" fill-opacity="0.65"/>
      <circle cx="34" cy="34" r="12" fill="${T.crimson}" stroke="${T.legendLight}" stroke-width="3"/>
    </g>`;
  const ornaments = [
    `<rect x="62" y="62" width="${W - 124}" height="${H - 124}" fill="none" stroke="${T.legend}" stroke-width="1.5" stroke-opacity="0.8"/>`,
    corner(30, 30, 1, 1),
    corner(W - 30, 30, -1, 1),
    corner(30, H - 30, 1, -1),
    corner(W - 30, H - 30, -1, -1),
  ].join('');

  const body = [
    wreath.join(''),
    image(badge, badgeX, badgeY, badgeSize),
    legendDivision('Legend League I', badgeX, badgeY, badgeSize),
    name,
    medalSvg,
  ].join('');
  const ended = s.ended(t.day(data.seasonEnd));
  return framePage(text, crest, { kicker: data.clanName, title: s.title, subtitle: ended }, body, frame, { defs, backdrop, ornaments });
}

/** A gold trophy cup centred on (`x`, `y`). */
function trophyIcon(x: number, y: number): string {
  return `<g transform="translate(${x - 30} ${y - 34})">
    <path d="M10,4 H50 V22 Q50,44 30,48 Q10,44 10,22 Z" fill="url(#goldLeaf)" stroke="${T.edge}" stroke-width="2"/>
    <path d="M10,10 H2 Q0,26 14,32 M50,10 H58 Q60,26 46,32" fill="none" stroke="${T.goldText}" stroke-width="4" stroke-linecap="round"/>
    <rect x="25" y="47" width="10" height="10" fill="${T.gold}"/>
    <rect x="15" y="56" width="30" height="10" rx="3" fill="url(#goldLeaf)" stroke="${T.edge}" stroke-width="1.5"/>
    <path d="M20,12 Q22,30 30,38" fill="none" stroke="${T.legendLight}" stroke-width="3" stroke-opacity="0.8" stroke-linecap="round"/>
  </g>`;
}

/** A globe of gold lines centred on (`x`, `y`). */
function globeIcon(x: number, y: number): string {
  const r = 32;
  return `<g fill="none" stroke="${T.goldText}" stroke-width="3">
    <circle cx="${x}" cy="${y}" r="${r}" fill="${T.electroDeep}"/>
    <ellipse cx="${x}" cy="${y}" rx="${r * 0.45}" ry="${r}"/>
    <line x1="${x}" y1="${y - r}" x2="${x}" y2="${y + r}"/>
    <line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}"/>
    <path d="M${x - r * 0.88},${y - r * 0.45} Q${x},${y - r * 0.6} ${x + r * 0.88},${y - r * 0.45} M${x - r * 0.88},${y + r * 0.45} Q${x},${y + r * 0.6} ${x + r * 0.88},${y + r * 0.45}"/>
  </g>`;
}
