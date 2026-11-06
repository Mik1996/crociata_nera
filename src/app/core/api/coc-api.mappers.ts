import { Attack, Clan, ClanMember, ClanRole, War, WarClan, WarParticipant, WarState } from '../models';
import {
  CocClan,
  CocClanMember,
  CocWar,
  CocWarAttack,
  CocWarClan,
  CocWarLogClan,
  CocWarLogEntry,
  CocWarMember,
} from './coc-api.types';

const ROLES: Record<CocClanMember['role'], ClanRole> = {
  leader: 'leader',
  coLeader: 'coLeader',
  admin: 'elder',
  member: 'member',
  notMember: 'member',
};

const STATES: Partial<Record<CocWar['state'], WarState>> = {
  preparation: 'preparation',
  inWar: 'battle',
  warEnded: 'ended',
};

/** Converts an API date (`20261105T120000.000Z`) to ISO 8601. */
export function parseCocDate(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(value);
  if (!m) {
    return value;
  }
  const [, y, mo, d, h, mi, s, ms = '.000'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${ms}Z`;
}

export function mapClanMember(raw: CocClanMember): ClanMember {
  return {
    tag: raw.tag,
    name: raw.name,
    role: ROLES[raw.role] ?? 'member',
    townHall: raw.townHallLevel ?? 0,
    expLevel: raw.expLevel,
    trophies: raw.trophies,
    donations: raw.donations,
    donationsReceived: raw.donationsReceived,
  };
}

export function mapClan(raw: CocClan): Clan {
  return {
    tag: raw.tag,
    name: raw.name,
    level: raw.clanLevel,
    description: raw.description ?? '',
    badgeUrl: raw.badgeUrls?.large ?? raw.badgeUrls?.medium ?? raw.badgeUrls?.small,
    warWins: raw.warWins ?? 0,
    warLosses: raw.warLosses ?? 0,
    warTies: raw.warTies ?? 0,
    warWinStreak: raw.warWinStreak ?? 0,
    isWarLogPublic: raw.isWarLogPublic ?? false,
    warLeague: raw.warLeague && raw.warLeague.name !== 'Unranked' ? raw.warLeague.name : undefined,
    members: (raw.memberList ?? []).map(mapClanMember),
  };
}

function mapAttack(raw: CocWarAttack): Attack {
  return {
    attackerTag: raw.attackerTag,
    defenderTag: raw.defenderTag,
    stars: raw.stars,
    destructionPercentage: raw.destructionPercentage,
    order: raw.order,
    durationSeconds: raw.duration ?? 0,
  };
}

function mapParticipant(raw: CocWarMember): WarParticipant {
  return {
    tag: raw.tag,
    name: raw.name,
    townHall: raw.townhallLevel,
    mapPosition: raw.mapPosition,
    attacks: (raw.attacks ?? []).map(mapAttack),
    opponentAttacks: raw.opponentAttacks,
    bestOpponentAttack: raw.bestOpponentAttack ? mapAttack(raw.bestOpponentAttack) : undefined,
  };
}

function mapWarClan(raw: CocWarClan): WarClan {
  const members = (raw.members ?? [])
    .map(mapParticipant)
    .sort((a, b) => a.mapPosition - b.mapPosition)
    // API positions are not always consecutive: normalise them to 1..N.
    .map((p, i) => ({ ...p, mapPosition: i + 1 }));
  return {
    tag: raw.tag,
    name: raw.name,
    level: raw.clanLevel,
    badgeUrl: raw.badgeUrls?.medium,
    stars: raw.stars,
    destructionPercentage: raw.destructionPercentage,
    attacksUsed: raw.attacks,
    members,
  };
}

/** Stable war id: preparation date + opponent tag. */
export function warId(raw: CocWar): string {
  const date = (raw.preparationStartTime ?? '').slice(0, 15);
  const opponent = (raw.opponent?.tag ?? '').replace('#', '');
  return `${date}-${opponent}`;
}

/** Maps an API war; returns `null` if the clan is not at war. */
export function mapWar(raw: CocWar): War | null {
  const state = STATES[raw.state];
  if (!state || !raw.clan || !raw.opponent) {
    return null;
  }
  return {
    id: warId(raw),
    state,
    preparationStartTime: parseCocDate(raw.preparationStartTime),
    startTime: parseCocDate(raw.startTime),
    endTime: parseCocDate(raw.endTime),
    teamSize: raw.teamSize ?? raw.clan.members?.length ?? 0,
    attacksPerMember: raw.attacksPerMember ?? 2,
    hasDetails: true,
    clan: mapWarClan(raw.clan),
    opponent: mapWarClan(raw.opponent),
  };
}

const HOUR_MS = 3_600_000;

function mapWarLogClan(raw: CocWarLogClan, fallbackName: string): WarClan {
  return {
    tag: raw.tag ?? '',
    name: raw.name ?? fallbackName,
    level: raw.clanLevel,
    badgeUrl: raw.badgeUrls?.medium,
    stars: raw.stars,
    destructionPercentage: raw.destructionPercentage,
    attacksUsed: raw.attacks ?? 0,
    members: [],
  };
}

/**
 * Maps a war log entry (summary only, no participants).
 * Returns `null` for League (CWL) entries, which have neither opponent nor result.
 */
export function mapWarLogEntry(raw: CocWarLogEntry): War | null {
  if (!raw.opponent?.tag || raw.result === null) {
    return null;
  }
  const endTime = parseCocDate(raw.endTime);
  // The war log does not report the start: estimate it (24h battle, 23h preparation).
  const endMs = new Date(endTime).getTime();
  const startTime = new Date(endMs - 24 * HOUR_MS).toISOString();
  const preparationStartTime = new Date(endMs - 47 * HOUR_MS).toISOString();
  return {
    id: `warlog-${raw.endTime.slice(0, 15)}-${raw.opponent.tag.replace('#', '')}`,
    state: 'ended',
    preparationStartTime,
    startTime,
    endTime,
    teamSize: raw.teamSize,
    attacksPerMember: raw.attacksPerMember ?? 2,
    hasDetails: false,
    // The tag doubles as display name when the war log omits it.
    clan: mapWarLogClan(raw.clan, raw.clan.tag ?? ''),
    opponent: mapWarLogClan(raw.opponent, raw.opponent.tag ?? ''),
  };
}

function totals(c: WarClan): Pick<WarClan, 'stars' | 'destructionPercentage'> {
  return { stars: c.stars, destructionPercentage: c.destructionPercentage };
}

/**
 * Archived wars still "in progress" whose end time has already passed (the proxy did not capture
 * the final snapshot) are considered ended with the last known data.
 */
export function closeExpiredWars(wars: War[], now: Date): War[] {
  return wars.map((w) =>
    w.state !== 'ended' && w.endTime && new Date(w.endTime) < now ? { ...w, state: 'ended' } : w,
  );
}

/**
 * Merges archived wars (with details) and war log wars (summary only).
 * The same war present in both is recognised by end time + opponent: the archived,
 * more complete version is kept. Result: only ended wars, most recent first.
 */
export function mergeWarHistory(archived: War[], warLog: War[]): War[] {
  const key = (w: War) => `${w.endTime}|${w.opponent.tag}`;
  const byKey = new Map<string, War>();
  for (const w of warLog) byKey.set(key(w), w);
  for (const w of archived) {
    const summary = byKey.get(key(w));
    // War log totals are final: they take precedence over a possibly stale snapshot.
    byKey.set(
      key(w),
      summary
        ? {
            ...w,
            state: 'ended',
            clan: { ...w.clan, ...totals(summary.clan) },
            opponent: { ...w.opponent, ...totals(summary.opponent) },
          }
        : w,
    );
  }
  return [...byKey.values()]
    .filter((w) => w.state === 'ended')
    .sort((a, b) => b.endTime.localeCompare(a.endTime));
}
