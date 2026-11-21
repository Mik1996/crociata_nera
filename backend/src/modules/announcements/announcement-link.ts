import { primaryClanTag } from '@/lib/coc/crusade-clans';
import { appUrl } from '@/modules/auth/account.service';
import { AnnouncementData } from './announcement-data';

/**
 * Page of the site an announcement leads to (its button and the "crociatanera.it" of its caption):
 * the month in the statistics, the CWL season, the player's profile, the war, the Raid Weekend... The pages show the main
 * clan only: the sister clans' announcements lead to the welcome page, which lists every clan.
 * `null` when the site has no public `https` address (development): Telegram refuses the buttons
 * of other addresses.
 */
export function announcementLink(data: AnnouncementData): string | null {
  const base = appUrl();
  if (!base.startsWith('https://')) return null;
  if (data.clanTag !== primaryClanTag()) return `${base}/`;
  switch (data.kind) {
    case 'month':
      return `${base}/statistics?period=${data.month}`;
    case 'cwl':
      return `${base}/cwl?season=${data.season}`;
    case 'donations':
      return `${base}/players`;
    case 'record':
      return `${base}/`;
    case 'promotion':
    case 'legendSeason':
      return `${base}/players/${encodeURIComponent(data.playerTag)}`;
    case 'war':
      return `${base}/wars/${encodeURIComponent(data.warKey)}`;
    case 'raid':
      return `${base}/raids?weekend=${encodeURIComponent(data.startTime)}`;
  }
}
