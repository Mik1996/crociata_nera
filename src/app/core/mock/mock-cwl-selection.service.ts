import { inject, Injectable } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import {
  CwlExclusion,
  CwlScoreBreakdown,
  CwlSelection,
  CwlSelectionPlayer,
  CwlSelectionStatus,
} from '../backend/backend-api.types';
import { CwlSelectionService } from '../backend/cwl-selection.service';
import { ClanMember } from '../models';
import { Random } from './random';

const STARTERS = 15;
const RESERVES = 3;
const DAY = 86_400_000;
/** Order of the roles on equal score and town hall (same as the backend). */
const ROLE_ORDER: readonly ClanMember['role'][] = ['leader', 'coLeader', 'elder', 'member'];
const API_ROLES: Record<ClanMember['role'], string> = {
  leader: 'leader',
  coLeader: 'coLeader',
  elder: 'admin',
  member: 'member',
};

/**
 * Demo ranking for the CWL line-up, made up from the mock clan members (same ordering rules as the
 * backend, random results). Exclusions are kept in memory until the page is reloaded.
 */
@Injectable()
export class MockCwlSelectionService extends CwlSelectionService {
  private readonly api = inject(CocApiService);
  private readonly exclusions = new Map<string, CwlExclusion>();

  get(): Observable<CwlSelection> {
    return this.api
      .getClan()
      .pipe(map((clan) => mockSelection(clan.members, new Date(), this.exclusions)));
  }

  exclude(tag: string, reason: string | null): Observable<CwlExclusion> {
    const exclusion = { reason, excludedBy: 'demo', excludedAt: new Date().toISOString() };
    this.exclusions.set(tag, exclusion);
    return of(exclusion).pipe(delay(200));
  }

  readmit(tag: string): Observable<void> {
    this.exclusions.delete(tag);
    return of(undefined).pipe(delay(200));
  }
}

/** Clans where the mock players fought the last CWL. */
const CWL_CLANS = ['#2J8JVVCLC', '#2JU8RPR2G', '#2RRYUGQYJ'];

export function mockSelection(
  members: ClanMember[],
  now: Date,
  exclusions: ReadonlyMap<string, CwlExclusion> = new Map(),
): CwlSelection {
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
    const joinedAt = random.chance(0.1) ? new Date(now.getTime() - random.int(1, 13) * DAY) : null;
    const newcomer = joinedAt !== null;

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
        ? round(25 * ((2 / 3) * (heroes.levels / 100) + (1 / 3) * (heroes.equipment / 100)))
        : 0,
      townHall: m.townHall === maxTownHall ? 10 : 0,
      missedAttacks: cwl ? -Math.min(15, cwl.missed * 3) : 0,
      activity: newcomer ? -5 : 0,
    };
    const total = Object.values(breakdown).reduce((sum, part) => sum + part, 0);
    return {
      member: m,
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
        slotsTaken <= STARTERS
          ? 'starter'
          : slotsTaken <= STARTERS + RESERVES
            ? 'reserve'
            : 'bench';
    }
    return {
      rank: index + 1,
      tag: s.member.tag,
      name: s.member.name,
      role: API_ROLES[s.member.role],
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
    };
  });
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    generatedAt: now.toISOString(),
    starters: STARTERS,
    reserves: RESERVES,
    maxTownHall,
    minEligibleTownHall: maxTownHall - 1,
    cwlSeason: lastMonth.toISOString().slice(0, 7),
    warWindow: { from: new Date(now.getTime() - 90 * DAY).toISOString(), days: 90, wars: 24 },
    players,
  };
}

function round(value: number, decimals = 1): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
