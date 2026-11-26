import { inject, Injectable } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';
import { crusadeClanNames, selectionFilters } from '../../shared/components/table/clan-tables';
import { TableQuery } from '../../shared/components/table/table-filters';
import { applyTableQuery, TablePage } from '../../shared/components/table/table-page';
import { CocApiService } from '../api/coc-api';
import {
  CwlExclusion,
  CwlLineup,
  CwlLineupSize,
  CWL_LINEUP_SIZES,
  CwlScoreBreakdown,
  CwlSelection,
  CwlSelectionPlayer,
  CwlSelectionStatus,
  CwlSelectionView,
} from '../backend/backend-api.types';
import { CwlSelectionService } from '../backend/cwl-selection.service';
import { APP_CONFIG } from '../config/app-config';
import { ClanMember } from '../models';
import { Random } from './random';

const DAY = 86_400_000;
/** Order of the roles on equal score, town hall and league (same as the backend). */
const ROLE_ORDER: readonly ClanMember['role'][] = ['leader', 'coLeader', 'elder', 'member'];
const API_ROLES: Record<ClanMember['role'], string> = {
  leader: 'leader',
  coLeader: 'coLeader',
  elder: 'admin',
  member: 'member',
};

/** The ranking alone, without the season and its state. */
type CwlRanking = Omit<
  CwlSelection,
  | 'season'
  | 'state'
  | 'signupStart'
  | 'closedAt'
  | 'closedBy'
  | 'closedAutomatically'
  | 'canReopen'
  | 'seasons'
>;

/** `2026-11` of a date (UTC) and the season after one. */
const seasonOf = (date: Date) => date.toISOString().slice(0, 7);
function nextSeason(season: string): string {
  const [year = 0, month = 1] = season.split('-').map(Number);
  return seasonOf(new Date(Date.UTC(year, month, 1)));
}

/**
 * Demo selections for the CWL line-up, made up from the mock clan members, spread over the clans of
 * the Crusade (same ordering rules as the backend, random results). The open season is next month's
 * (this month's CWL has started); closing freezes it and opens the next one. Exclusions and closed
 * selections are kept in memory until the page is reloaded. Every action is allowed (demo).
 */
@Injectable()
export class MockCwlSelectionService extends CwlSelectionService {
  private readonly api = inject(CocApiService);
  private readonly config = inject(APP_CONFIG);
  private readonly exclusions = new Map<string, CwlExclusion>();
  /** Closed selections by season, with their frozen ranking. */
  private readonly closed = new Map<string, { ranking: CwlRanking; closedAt: string }>();
  private openSeason = nextSeason(seasonOf(new Date()));
  /** Size of the line-up of the open selection; the next season keeps it. */
  private lineupSize: CwlLineupSize = 15;

  get(season?: string): Observable<CwlSelectionView> {
    const wanted = season ?? this.openSeason;
    const frozen = this.closed.get(wanted);
    if (frozen) return of(this.view(wanted, frozen.ranking, frozen.closedAt));
    return this.api
      .getClan()
      .pipe(
        map((clan) =>
          this.view(
            wanted,
            mockSelection(clan.members, new Date(), this.exclusions, this.lineupSize),
            null,
          ),
        ),
      );
  }

  getPlayersTable(query: TableQuery, season?: string): Observable<TablePage<CwlSelectionPlayer>> {
    const names = crusadeClanNames({ tag: this.config.clanTag, name: this.config.clanName });
    const filters = selectionFilters((tag) => names.get(tag) ?? tag);
    return this.get(season).pipe(
      map((selection) => applyTableQuery(selection.players, filters, query)),
    );
  }

  exclude(tag: string, reason: string | null, untilRevoked: boolean): Observable<CwlExclusion> {
    const exclusion = {
      reason,
      untilRevoked,
      excludedBy: 'demo',
      excludedAt: new Date().toISOString(),
    };
    this.exclusions.set(tag, exclusion);
    return of(exclusion).pipe(delay(200));
  }

  readmit(tag: string): Observable<void> {
    this.exclusions.delete(tag);
    return of(undefined).pipe(delay(200));
  }

  close(season: string, lineup: CwlLineup | null = null): Observable<CwlSelection> {
    return this.get(season).pipe(
      map((selection) => {
        const players = lineup ? applyLineup(selection.players, lineup) : selection.players;
        const { generatedAt, maxTownHall, minEligibleTownHall } = selection;
        // A line-up picked by hand has its own size.
        const starters = lineup?.starters.length ?? selection.starters;
        const reserves = lineup?.reserves.length ?? selection.reserves;
        const { cwlSeason, warWindow } = selection;
        const ranking = {
          players,
          generatedAt,
          starters,
          reserves,
          maxTownHall,
          minEligibleTownHall,
          cwlSeason,
          warWindow,
        };
        this.closed.set(season, { ranking, closedAt: new Date().toISOString() });
        // Exclusions for this season only end with it.
        for (const [tag, exclusion] of this.exclusions) {
          if (!exclusion.untilRevoked) this.exclusions.delete(tag);
        }
        this.openSeason = nextSeason(season);
        return this.view(season, ranking, this.closed.get(season)!.closedAt);
      }),
      delay(300),
    );
  }

  reopen(season: string): Observable<CwlSelection> {
    this.closed.delete(season);
    this.openSeason = season;
    return this.get(season).pipe(delay(300));
  }

  setLineupSize(season: string, starters: CwlLineupSize): Observable<CwlSelection> {
    this.lineupSize = starters;
    return this.get(season).pipe(delay(200));
  }

  private view(season: string, ranking: CwlRanking, closedAt: string | null): CwlSelectionView {
    const [year = 0, month = 1] = season.split('-').map(Number);
    const seasons = [
      { season: this.openSeason, state: 'open' as const },
      ...[...this.closed.keys()].map((s) => ({ season: s, state: 'closed' as const })),
    ].sort((a, b) => b.season.localeCompare(a.season));
    return {
      ...ranking,
      season,
      state: closedAt ? 'closed' : 'open',
      signupStart: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
      closedAt,
      closedBy: closedAt ? 'demo' : null,
      closedAutomatically: false,
      canReopen: !!closedAt && season === [...this.closed.keys()].sort().at(-1),
      seasons,
      permissions: { manage: true, export: true },
    };
  }
}

/** Clans of the Crusade: where the mock players are and fought the last CWL. */
const CWL_CLANS = ['#2J8JVVCLC', '#2JU8RPR2G', '#2RRYUGQYJ'];

export function mockSelection(
  members: ClanMember[],
  now: Date,
  exclusions: ReadonlyMap<string, CwlExclusion> = new Map(),
  starters: CwlLineupSize = 15,
): CwlRanking {
  const reserves = CWL_LINEUP_SIZES[starters];
  const random = new Random(2026);
  const maxTownHall = Math.max(...members.map((m) => m.townHall));
  const scored = members.map((m) => {
    const townHallOk = m.townHall >= maxTownHall - 1;
    const strength = random.range(0.2, 1);
    // About two players out of three were in the last CWL, mostly with Crociata Nera.
    const inCwl = random.chance(townHallOk ? 0.7 : 0.3);
    const wars = random.int(0, 12);
    const attacksAvailable = wars * 2;
    const attacksUsed = Math.round(attacksAvailable * random.range(0.6, 1));
    const warStars = attacksUsed ? Math.min(3, round(1 + strength * 2, 2)) : 0;
    const heroes = random.chance(0.9)
      ? { levels: round(55 + strength * 45), equipment: round(40 + strength * 60) }
      : null;
    // Mostly in Crociata Nera, some in Crociata Rossa and d'Oro.
    const clanTag = random.chance(0.6) ? CWL_CLANS[0] : random.pick(CWL_CLANS.slice(1));
    const joinedAt = random.chance(0.1) ? new Date(now.getTime() - random.int(1, 13) * DAY) : null;
    // Only members are new (elders and above may come back after a while).
    const newcomer = joinedAt !== null && m.role === 'member';

    let cwl: CwlSelectionPlayer['cwl'] = null;
    if (inCwl) {
      const cwlWars = random.int(3, 7);
      const attacks = Math.max(0, cwlWars - (random.chance(0.2) ? random.int(1, 2) : 0));
      const stars = round(Math.min(3, 1.2 + strength * 1.8), 2);
      const roll = random.next() * strength;
      cwl = {
        clanTag: random.chance(0.75) ? CWL_CLANS[0] : random.pick(CWL_CLANS.slice(1)),
        allAttacks: attacks === cwlWars,
        striker:
          attacks >= 3
            ? roll > 0.6
              ? 'gold'
              : roll > 0.45
                ? 'silver'
                : roll > 0.3
                  ? 'bronze'
                  : null
            : null,
        wars: cwlWars,
        attacks,
        missed: cwlWars - attacks,
        averageStarsPerAttack: attacks ? stars : 0,
        averageDestruction: attacks ? round(60 + (stars / 3) * 40) : 0,
      };
    }
    const maxPoints = cwl ? 40 : 65;
    const strikerPoints = cwl?.striker ? { gold: 7, silver: 5, bronze: 3 }[cwl.striker] : 0;
    const breakdown: CwlScoreBreakdown = {
      cwlCommendations: cwl ? round((12 * ((cwl.allAttacks ? 5 : 0) + strikerPoints)) / 12) : 0,
      cwlPerformance: cwl?.attacks
        ? round(13 * (cwl.averageStarsPerAttack / 3) * Math.min(1, cwl.attacks / 3))
        : 0,
      war: attacksAvailable
        ? round(
            maxPoints *
              (0.75 * (warStars / 3) + 0.25 * (attacksUsed / attacksAvailable)) *
              Math.min(1, attacksUsed / 8),
          )
        : 0,
      heroes: heroes
        ? round(20 * ((2 / 3) * (heroes.levels / 100) + (1 / 3) * (heroes.equipment / 100)))
        : 0,
      townHall: m.townHall === maxTownHall ? 10 : 0,
      // 1 point per league tier above Dragon League 30, at most 5 (same as the backend).
      league: m.league ? Math.max(0, Math.min(5, m.league.id - 105_000_030)) : 0,
      missedAttacks: cwl ? -Math.min(15, cwl.missed * 3) : 0,
      activity: newcomer ? -5 : 0,
    };
    const total = Object.values(breakdown).reduce((sum, part) => sum + part, 0);
    return {
      member: m,
      clanTag,
      townHallOk,
      score: Math.max(0, Math.min(100, total)),
      breakdown,
      cwl,
      war: {
        wars,
        attacksUsed,
        attacksAvailable,
        averageStarsPerAttack: warStars,
        averageDestruction: attacksUsed ? round(50 + (warStars / 3) * 50) : 0,
        maxPoints,
      },
      heroes,
      activity: { joinedAt: joinedAt?.toISOString() ?? null, newcomer },
    };
  });
  scored.sort(
    (a, b) =>
      Number(b.townHallOk) - Number(a.townHallOk) ||
      b.score - a.score ||
      b.member.townHall - a.member.townHall ||
      (b.member.league?.id ?? 0) - (a.member.league?.id ?? 0) ||
      ROLE_ORDER.indexOf(a.member.role) - ROLE_ORDER.indexOf(b.member.role) ||
      a.member.name.localeCompare(b.member.name),
  );
  let slotsTaken = 0;
  const players = scored.map((s, index): CwlSelectionPlayer => {
    const exclusion = exclusions.get(s.member.tag) ?? null;
    let status: CwlSelectionStatus;
    if (exclusion) status = 'excluded';
    else if (!s.townHallOk) status = 'ineligible';
    else {
      slotsTaken += 1;
      status =
        slotsTaken <= starters
          ? 'starter'
          : slotsTaken <= starters + reserves
            ? 'reserve'
            : 'bench';
    }
    return {
      rank: index + 1,
      tag: s.member.tag,
      name: s.member.name,
      clanTag: s.clanTag,
      role: API_ROLES[s.member.role],
      league: s.member.league
        ? {
            id: s.member.league.id,
            name: s.member.league.name,
            iconUrl: s.member.league.iconUrl ?? null,
          }
        : null,
      townHallLevel: s.member.townHall,
      eligible: s.townHallOk && !exclusion,
      status,
      score: round(s.score),
      breakdown: s.breakdown,
      war: s.war,
      cwl: s.cwl,
      heroes: s.heroes,
      activity: s.activity,
      exclusion,
      automaticStatus: null,
    };
  });
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    generatedAt: now.toISOString(),
    starters,
    reserves,
    maxTownHall,
    minEligibleTownHall: maxTownHall - 1,
    cwlSeason: lastMonth.toISOString().slice(0, 7),
    warWindow: { from: new Date(now.getTime() - 90 * DAY).toISOString(), days: 90, wars: 24 },
    players,
  };
}

/** The line-up picked by hand on the ranking (same rules as the backend's `applyLineup`). */
function applyLineup(players: CwlSelectionPlayer[], lineup: CwlLineup): CwlSelectionPlayer[] {
  const picked = new Map<string, CwlSelectionStatus>([
    ...lineup.starters.map((tag) => [tag, 'starter'] as const),
    ...lineup.reserves.map((tag) => [tag, 'reserve'] as const),
  ]);
  return players.map((p) => {
    if (p.status !== 'starter' && p.status !== 'reserve' && p.status !== 'bench') return p;
    const status = picked.get(p.tag) ?? 'bench';
    return status === p.status ? p : { ...p, status, automaticStatus: p.status };
  });
}

function round(value: number, decimals = 1): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
