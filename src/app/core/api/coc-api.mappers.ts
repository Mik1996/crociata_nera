import {
  Attack,
  Clan,
  ClanMember,
  ClanRole,
  IconItem,
  PlayerHero,
  PlayerProfile,
  PlayerUnit,
  War,
  WarClan,
  WarParticipant,
  WarState,
} from '../models';
import {
  CocClan,
  CocClanMember,
  CocNamedIcon,
  CocPlayer,
  CocPlayerItem,
  CocWar,
  CocWarAttack,
  CocWarClan,
  CocWarLogClan,
  CocWarLogEntry,
  CocWarMember,
} from './coc-api.types';
import { isSuperTroop, PETS, SIEGE_MACHINES, SUPER_TROOP_BASE, townHallImage, unitIcon } from '../game/units';

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
    warLeague: raw.warLeague && raw.warLeague.name !== 'Unranked' ? { id: raw.warLeague.id, name: raw.warLeague.name } : undefined,
    capitalLeague: rankedLeague(raw.capitalLeague),
    capitalHallLevel: raw.clanCapital?.capitalHallLevel ?? 0,
    clanPoints: raw.clanPoints ?? 0,
    capitalPoints: raw.clanCapitalPoints ?? 0,
    location: raw.location?.name,
    locationId: raw.location?.id,
    countryCode: raw.location?.isCountry ? raw.location.countryCode : undefined,
    chatLanguage: raw.chatLanguage?.name,
    labels: (raw.labels ?? []).map((l) => ({ name: l.name, iconUrl: l.iconUrls?.medium ?? l.iconUrls?.small })),
    type: raw.type,
    requiredTownHall: raw.requiredTownhallLevel,
    requiredTrophies: raw.requiredTrophies,
    requiredLeague: raw.requiredLeagueTier
      ? {
          name: raw.requiredLeagueTier.name,
          iconUrl: raw.requiredLeagueTier.iconUrls?.large ?? raw.requiredLeagueTier.iconUrls?.small,
        }
      : undefined,
    members: (raw.memberList ?? []).map(mapClanMember),
  };
}

/** League name, or `undefined` when the clan is not ranked. */
function rankedLeague(league: { name: string } | undefined): string | undefined {
  return league && league.name !== 'Unranked' ? league.name : undefined;
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

// --- Player profile ---------------------------------------------------------

function iconItem(raw: CocNamedIcon | undefined): IconItem | undefined {
  if (!raw || raw.name === 'Unranked') return undefined;
  const icons = raw.iconUrls;
  return { name: raw.name, icon: icons?.large ?? icons?.medium ?? icons?.small ?? icons?.tiny };
}

function mapUnit(raw: CocPlayerItem): PlayerUnit {
  return {
    name: raw.name,
    village: raw.village,
    level: raw.level,
    maxLevel: raw.maxLevel,
    icon: unitIcon(raw.village, raw.name),
  };
}

/** Maps `GET /players/{tag}` grouping units the way the game shows them. */
export function mapPlayerProfile(raw: CocPlayer): PlayerProfile {
  const troops = raw.troops ?? [];
  const home = troops.filter((t) => t.village === 'home');
  const isSuper = (t: CocPlayerItem) => isSuperTroop(t.name);
  const heroes = raw.heroes ?? [];
  const legend = raw.legendStatistics;
  const homeByName = new Map(home.map((t) => [t.name, t]));
  /** A super troop takes the level of its base troop, as in the game. */
  const superTroop = (t: CocPlayerItem) => {
    const base = homeByName.get(SUPER_TROOP_BASE[t.name]);
    return {
      ...mapUnit(t),
      level: base?.level ?? t.level,
      maxLevel: base?.maxLevel ?? t.maxLevel,
      active: !!t.superTroopIsActive,
    };
  };

  return {
    tag: raw.tag,
    name: raw.name,
    role: raw.role ? ROLES[raw.role] : undefined,
    expLevel: raw.expLevel,
    townHall: raw.townHallLevel,
    townHallImage: townHallImage(raw.townHallLevel),
    townHallWeapon: raw.townHallWeaponLevel,
    trophies: raw.trophies,
    bestTrophies: raw.bestTrophies,
    league: iconItem(raw.league),
    leagueTier: iconItem(raw.leagueTier),
    legendTrophies: legend?.legendTrophies,
    legendRank: legend?.currentSeason?.rank,
    warStars: raw.warStars,
    warPreference: raw.warPreference,
    attackWins: raw.attackWins,
    defenseWins: raw.defenseWins,
    donations: raw.donations,
    donationsReceived: raw.donationsReceived,
    capitalContributions: raw.clanCapitalContributions ?? 0,
    builderHall: raw.builderHallLevel,
    builderBaseTrophies: raw.builderBaseTrophies,
    bestBuilderBaseTrophies: raw.bestBuilderBaseTrophies,
    builderBaseLeague: raw.builderBaseLeague?.name,
    clan: raw.clan && {
      tag: raw.clan.tag,
      name: raw.clan.name,
      level: raw.clan.clanLevel,
      badgeUrl: raw.clan.badgeUrls?.medium ?? raw.clan.badgeUrls?.small,
    },
    labels: (raw.labels ?? []).map((l) => iconItem(l)).filter((l): l is IconItem => !!l),
    heroes: heroes
      .filter((h) => h.village === 'home')
      .map((h): PlayerHero => ({ ...mapUnit(h), equipment: (h.equipment ?? []).map(mapUnit) })),
    troops: home.filter((t) => !isSuper(t) && !SIEGE_MACHINES.has(t.name) && !PETS.has(t.name)).map(mapUnit),
    superTroops: home.filter(isSuper).map(superTroop),
    siegeMachines: home.filter((t) => SIEGE_MACHINES.has(t.name)).map(mapUnit),
    pets: home.filter((t) => PETS.has(t.name)).map(mapUnit),
    spells: (raw.spells ?? []).filter((s) => s.village === 'home').map(mapUnit),
    heroEquipment: (raw.heroEquipment ?? []).filter((e) => e.village === 'home').map(mapUnit),
    builderBaseHeroes: heroes.filter((h) => h.village === 'builderBase').map(mapUnit),
    builderBaseTroops: troops.filter((t) => t.village === 'builderBase').map(mapUnit),
    achievements: (raw.achievements ?? []).map((a) => ({
      name: a.name,
      stars: a.stars,
      value: a.value,
      target: a.target,
      info: a.info,
      completionInfo: a.completionInfo ?? undefined,
      village: a.village,
    })),
  };
}
