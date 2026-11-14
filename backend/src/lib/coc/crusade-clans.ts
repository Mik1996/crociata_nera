import { env } from '@/lib/config/env';

/**
 * Clans of the Crusade: Crociata Nera (the main clan, `CLAN_TAG`), Crociata Rossa and Crociata
 * d'Oro. The backend saves the wars, CWL, Raid Weekends, members and donations of all of them, and
 * awards the commendations to their players. The pages of the site show the main clan.
 */
export const CRUSADE_CLAN_TAGS: readonly string[] = ['#2J8JVVCLC', '#2JU8RPR2G', '#2RRYUGQYJ'];

/** The main clan (`CLAN_TAG`), whose data the pages show; `null` when not configured. */
export function primaryClanTag(): string | null {
  return env().CLAN_TAG ?? null;
}

/** The clans of the Crusade, the main one (`CLAN_TAG`) first. */
export function crusadeClanTags(): string[] {
  const primary = primaryClanTag();
  return [...new Set([...(primary ? [primary] : []), ...CRUSADE_CLAN_TAGS])];
}

/**
 * Suffix of the commendation periods of a clan: none for the main clan (keys saved before the
 * other clans were tracked stay valid), `@<tag>` for the others (`month:2026-11@#2JU8RPR2G`).
 */
export function periodSuffix(clanTag: string): string {
  return clanTag === primaryClanTag() ? '' : `@${clanTag}`;
}
