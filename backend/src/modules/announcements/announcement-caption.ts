import { escapeHtml } from '@/lib/telegram/telegram-client';
import {
  AnnouncementData,
  CwlData,
  DonationsData,
  Honour,
  LegendSeasonData,
  MonthData,
  PromotionData,
  RecordData,
} from './announcement-data';
import { AnnouncementLanguage, AnnouncementTexts, announcementTexts } from './announcement-texts';

/**
 * Captions of the announcements. They are plain text, where `**text**` is bold: what the
 * administrators edit on the site, turned into Telegram HTML when published ({@link captionToHtml}).
 */

/** Telegram's limit for the caption of a picture (visible characters). */
export const ANNOUNCEMENT_CAPTION_LIMIT = 1024;

/** Names listed in the caption under each commendation (the pictures list them all). */
const MAX_NAMES = 6;
/** Legend League I: the top of the game. */
const TOP_LEAGUE = 105000036;
/** Legend League III and up. */
const LEGEND_LEAGUES = 105000034;

/**
 * The caption of an announcement in a language (Italian, the channel's, by default), ending with
 * its hashtags.
 */
export function generatedCaption(data: AnnouncementData, language?: AnnouncementLanguage): string {
  const t = announcementTexts(language);
  return `${captionBody(t, data)}\n\n${hashtags(t, data)}`;
}

function captionBody(t: AnnouncementTexts, data: AnnouncementData): string {
  switch (data.kind) {
    case 'month':
      return monthCaption(t, data);
    case 'cwl':
      return cwlCaption(t, data);
    case 'donations':
      return donationsCaption(t, data);
    case 'record':
      return recordCaption(t, data);
    case 'promotion':
      return promotionCaption(t, data);
    case 'legendSeason':
      return legendSeasonCaption(t, data);
  }
}

/**
 * Hashtags of an announcement: its kind and its clan (`#CWL #CrociataNera`), so the members find
 * them with the search of the channel.
 */
export function hashtags(t: AnnouncementTexts, data: AnnouncementData): string {
  return `#${t.caption.hashtags[data.kind]} #${hashtagOf(data.clanName)}`;
}

/** A name as a hashtag: words joined, each with a capital (`Crociata d'Oro` -> `CrociataDOro`). */
function hashtagOf(name: string): string {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join('');
}

/** Flag emoji of a country (`IT` -> 🇮🇹). */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function legendSeasonCaption(t: AnnouncementTexts, data: LegendSeasonData): string {
  const c = t.caption.legendSeason;
  const lines = [`👑 ${c.title(data.playerName, t.league('Legend League I'))}`, '', c.trophies(t.number(data.trophies))];
  if (data.countryRank !== null && data.countryCode) {
    lines.push(`${flagEmoji(data.countryCode)} ${c.country(t.place(data.countryRank), t.country(data.countryCode))}`);
  }
  lines.push(c.world(t.place(data.worldRank)), '', c.closing);
  return lines.join('\n');
}

function promotionCaption(t: AnnouncementTexts, data: PromotionData): string {
  const c = t.caption.promotion;
  const top = data.league.id >= TOP_LEAGUE;
  const legend = data.league.id >= LEGEND_LEAGUES;
  const icon = top ? '👑' : legend ? '🔥' : '⚡';
  return [`${icon} ${c.title(data.playerName, t.league(data.league.name))}`, '', top ? c.top : legend ? c.legend : c.electro, '', c.congratulations(data.clanName)].join('\n');
}

function monthCaption(t: AnnouncementTexts, data: MonthData): string {
  const c = t.caption.month;
  const lines = [c.title(data.clanName, t.month(data.month)), ''];
  if (data.wars) {
    const w = data.wars;
    lines.push(c.wars(w.total, w.victories, w.draws, w.defeats), c.stars(t.number(w.averageStars, 2), t.number(w.threeStarRate, 1)));
  }
  if (data.raids) lines.push(c.raids(t.number(data.raids.capitalGold), data.raids.weekends));
  if (data.mvp) lines.push(c.best(data.mvp.name, t.number(data.mvp.averageStars, 2)));
  lines.push(...honourLines(t, data.honours), '', c.footer);
  return lines.join('\n');
}

function cwlCaption(t: AnnouncementTexts, data: CwlData): string {
  const c = t.caption.cwl;
  const lines = [c.title(data.clanName, t.month(data.season)), ''];
  if (data.rank !== null) lines.push(c.rank(t.place(data.rank), data.clans, data.stars));
  lines.push(c.results(data.wins, data.draws, data.losses));
  const best = data.bestAttackers;
  if (best?.names.length) {
    lines.push(c.best(best.names.length, best.names.map((name) => `**${name}**`).join(', '), best.stars, best.attacks));
  }
  lines.push(...honourLines(t, data.honours), '', c.footer);
  return lines.join('\n');
}

function donationsCaption(t: AnnouncementTexts, data: DonationsData): string {
  const c = t.caption.donations;
  const lines = [c.title(data.clanName, t.month(data.season)), '', c.total(t.number(data.total))];
  const medals = ['🥇', '🥈', '🥉'];
  data.top.slice(0, 3).forEach((p, i) => lines.push(`${medals[i]} **${p.name}**: ${t.number(p.donations)}`));
  lines.push(...honourLines(t, data.honours), '', c.footer);
  return lines.join('\n');
}

function recordCaption(t: AnnouncementTexts, data: RecordData): string {
  const c = t.caption.record;
  const lines = [c.title(data.clanName), ''];
  switch (data.record) {
    case 'perfectWars':
      lines.push(c.perfectWars(t.number(data.value)));
      break;
    case 'warWinStreak':
      lines.push(c.warWinStreak(data.value, data.previous));
      break;
    case 'cwlLeague': {
      const before = data.previousLeagueName && data.previousLeagueName !== data.leagueName ? t.league(data.previousLeagueName) : null;
      lines.push(c.cwlLeague(t.league(data.leagueName ?? ''), before));
      break;
    }
    case 'localRank':
    case 'localCapitalRank':
      lines.push(c.ranking(t.records[data.record], t.place(data.value), data.previous ? t.place(data.previous) : null));
      break;
    case 'capitalPoints':
      lines.push(c.capitalPoints(t.number(data.value), data.previous ? t.number(data.previous) : null));
      break;
  }
  lines.push('', c.footer);
  return lines.join('\n');
}

function honourLines(t: AnnouncementTexts, honours: Honour[]): string[] {
  if (!honours.length) return [];
  const lines = ['', `🎖️ **${t.caption.honours}**`];
  for (const honour of honours) {
    const names = honour.players.map((p) => (p.times > 1 ? `${p.name} ×${p.times}` : p.name));
    const shown = names.slice(0, MAX_NAMES).join(', ');
    const more = names.length > MAX_NAMES ? t.caption.andOthers(names.length - MAX_NAMES) : '';
    lines.push(`• ${t.commendations[honour.type][honour.tier]}: ${shown}${more}`);
  }
  return lines;
}

/**
 * Length of a caption as Telegram counts it: visible text (the `**` marks are not shown), in UTF-16
 * units (an emoji counts 2).
 */
export function captionLength(caption: string): number {
  return caption.replace(/\*\*(.+?)\*\*/gs, '$1').length;
}

/**
 * Fits a generated caption in Telegram's limit: commendation lines are dropped from the end, then
 * the text is cut.
 */
export function fitCaption(caption: string): string {
  let lines = caption.split('\n');
  while (captionLength(lines.join('\n')) > ANNOUNCEMENT_CAPTION_LIMIT) {
    const last = lines.findLastIndex((line) => line.startsWith('• '));
    if (last < 0) break;
    lines = lines.filter((_, i) => i !== last);
  }
  const fitted = lines.join('\n');
  if (captionLength(fitted) <= ANNOUNCEMENT_CAPTION_LIMIT) return fitted;
  const chars = Array.from(fitted.replace(/\*\*/g, ''));
  while (chars.join('').length > ANNOUNCEMENT_CAPTION_LIMIT - 1) chars.pop();
  return `${chars.join('')}…`;
}

/** Name of the site in the captions: a link to the page of the announcement when one is given. */
const SITE_NAME = /crociatanera\.it/gi;

/**
 * Caption as Telegram HTML: text escaped, `**text**` in bold, the name of the site a link to `link`
 * (the page of the announcement).
 */
export function captionToHtml(caption: string, link?: string | null): string {
  const html = escapeHtml(caption).replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
  return link ? html.replace(SITE_NAME, (name) => `<a href="${escapeHtml(link).replace(/"/g, '&quot;')}">${name}</a>`) : html;
}
