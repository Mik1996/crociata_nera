import { escapeHtml } from '@/lib/telegram/telegram-client';
import { AnnouncementData, CwlData, DonationsData, Honour, MonthData, RecordData } from './announcement-data';
import { COMMENDATION_LABELS, formatNumber, monthLabel, RECORD_LABELS } from './announcement-texts';

/**
 * Captions of the announcements. They are plain text, where `**text**` is bold: what the
 * administrators edit on the site, turned into Telegram HTML when published ({@link captionToHtml}).
 */

/** Telegram's limit for the caption of a picture (visible characters). */
export const ANNOUNCEMENT_CAPTION_LIMIT = 1024;

const SITE = 'crociatanera.it';
/** Names listed in the caption under each commendation (the pictures list them all). */
const MAX_NAMES = 6;

export function generatedCaption(data: AnnouncementData): string {
  switch (data.kind) {
    case 'month':
      return monthCaption(data);
    case 'cwl':
      return cwlCaption(data);
    case 'donations':
      return donationsCaption(data);
    case 'record':
      return recordCaption(data);
  }
}

function monthCaption(data: MonthData): string {
  const lines = [`⚔️ **${data.clanName} · ${monthLabel(data.month)}**`, ''];
  if (data.wars) {
    const w = data.wars;
    lines.push(
      `🛡️ ${w.total} ${w.total === 1 ? 'guerra' : 'guerre'}: ${w.victories} vinte, ${w.draws} pari, ${w.defeats} perse`,
      `⭐ ${formatNumber(w.averageStars, 2)} stelle a guerra · ${formatNumber(w.threeStarRate, 1)}% di tre stelle`,
    );
  }
  if (data.raids) {
    lines.push(`🏰 ${formatNumber(data.raids.capitalGold)} di oro della capitale in ${data.raids.weekends} Raid Weekend`);
  }
  if (data.mvp) lines.push(`👑 Migliore del mese: **${data.mvp.name}** (${formatNumber(data.mvp.averageStars, 2)} stelle a guerra)`);
  lines.push(...honourLines(data.honours));
  lines.push('', `Tutte le statistiche su ${SITE}`);
  return lines.join('\n');
}

function cwlCaption(data: CwlData): string {
  const lines = [`🏆 **${data.clanName} · CWL di ${monthLabel(data.season)}**`, ''];
  if (data.rank !== null) lines.push(`📊 ${data.rank}° posto su ${data.clans} con ${data.stars} stelle`);
  lines.push(`⚔️ ${data.wins} ${data.wins === 1 ? 'vittoria' : 'vittorie'}, ${data.draws} pari, ${data.losses} ${data.losses === 1 ? 'sconfitta' : 'sconfitte'}`);
  const best = data.bestAttackers;
  if (best?.names.length) {
    const label = best.names.length > 1 ? 'Migliori attaccanti' : 'Migliore attaccante';
    const names = best.names.map((name) => `**${name}**`).join(', ');
    lines.push(`👑 ${label}: ${names} (${best.stars} stelle in ${best.attacks} attacchi)`);
  }
  lines.push(...honourLines(data.honours));
  lines.push('', `Tutta la lega su ${SITE}`);
  return lines.join('\n');
}

function donationsCaption(data: DonationsData): string {
  const lines = [`🤝 **${data.clanName} · donazioni di ${monthLabel(data.season)}**`, ''];
  lines.push(`📦 ${formatNumber(data.total)} truppe donate nella stagione`);
  const medals = ['🥇', '🥈', '🥉'];
  data.top.slice(0, 3).forEach((p, i) => lines.push(`${medals[i]} **${p.name}**: ${formatNumber(p.donations)}`));
  lines.push(...honourLines(data.honours));
  lines.push('', `Grazie a chi rinforza i compagni! Classifica completa su ${SITE}`);
  return lines.join('\n');
}

function recordCaption(data: RecordData): string {
  const label = RECORD_LABELS[data.record];
  const lines = [`⚔️ **Nuovo record di ${data.clanName}!** ⚔️`, ''];
  switch (data.record) {
    case 'perfectWars':
      lines.push(`⭐ **${formatNumber(data.value)} guerre perfette**: ogni stella presa, ogni volta.`);
      break;
    case 'warWinStreak':
      lines.push(`⚔️ **${data.value} guerre vinte di fila**${data.previous ? ` (precedente: ${data.previous})` : ''}.`);
      break;
    case 'cwlLeague':
      lines.push(
        `🏆 Siamo in **${data.leagueName}**: la lega più alta mai raggiunta${
          data.previousLeagueName && data.previousLeagueName !== data.leagueName ? ` (prima: ${data.previousLeagueName})` : ''
        }.`,
      );
      break;
    case 'localRank':
    case 'localCapitalRank':
      lines.push(`📈 ${label}: **${data.value}° posto**${data.previous ? ` (precedente: ${data.previous}°)` : ''}.`);
      break;
    case 'capitalPoints':
      lines.push(`🏰 **${formatNumber(data.value)} trofei della capitale**${data.previous ? ` (precedente: ${formatNumber(data.previous)})` : ''}.`);
      break;
  }
  lines.push('', `Tutti i record su ${SITE}`);
  return lines.join('\n');
}

function honourLines(honours: Honour[]): string[] {
  if (!honours.length) return [];
  const lines = ['', '🎖️ **Encomi**'];
  for (const honour of honours) {
    const names = honour.players.map((p) => (p.times > 1 ? `${p.name} ×${p.times}` : p.name));
    const shown = names.slice(0, MAX_NAMES).join(', ');
    const more = names.length > MAX_NAMES ? ` e altri ${names.length - MAX_NAMES}` : '';
    lines.push(`• ${COMMENDATION_LABELS[honour.type][honour.tier]}: ${shown}${more}`);
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

/** Caption as Telegram HTML: text escaped, `**text**` in bold. */
export function captionToHtml(caption: string): string {
  return escapeHtml(caption).replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
}
