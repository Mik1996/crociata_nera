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
const SEASONS = 4;
const DAY = 86_400_000;
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
    const cwl = { allAttacks: 0, gold: 0, silver: 0, bronze: 0 };
    for (let season = 0; season < SEASONS; season++) {
      if (random.chance(strength)) cwl.allAttacks += 1;
      const roll = random.next() * strength;
      const tier = roll > 0.7 ? 'gold' : roll > 0.5 ? 'silver' : roll > 0.3 ? 'bronze' : null;
      if (tier) cwl[tier] += 1;
    }
    const cwlWars = random.int(0, 4 * 7) * (townHallOk ? 1 : 0.3);
    const cwlAttacks = Math.round(cwlWars * random.range(0.8, 1));
    const cwlStars = Math.min(3, round(1.2 + strength * 1.8, 2));
    const wars = random.int(0, 12);
    const attacksAvailable = wars * 2;
    const attacksUsed = Math.round(attacksAvailable * random.range(0.6, 1));
    const warStars = attacksUsed ? Math.min(3, round(1 + strength * 2, 2)) : 0;
    const heroes = random.chance(0.9)
      ? { levels: round(55 + strength * 45), equipment: round(40 + strength * 60) }
      : null;
    const joinedAt = random.chance(0.1) ? new Date(now.getTime() - random.int(1, 13) * DAY) : null;
    const newcomer = joinedAt !== null;
    const inactive = attacksUsed === 0;
    const missed = Math.round(cwlWars) - cwlAttacks;
    const breakdown: CwlScoreBreakdown = {
      cwlCommendations: round(
        (30 * (cwl.allAttacks * 5 + cwl.gold * 7 + cwl.silver * 5 + cwl.bronze * 3)) / 48,
      ),
      cwlPerformance: cwlAttacks ? round(20 * (cwlStars / 3) * Math.min(1, cwlAttacks / 5)) : 0,
      war: attacksAvailable
        ? round(
            25 *
              (0.75 * (warStars / 3) + 0.25 * (attacksUsed / attacksAvailable)) *
              Math.min(1, attacksUsed / 8),
          )
        : 0,
      heroes: heroes
        ? round(15 * ((2 / 3) * (heroes.levels / 100) + (1 / 3) * (heroes.equipment / 100)))
        : 0,
      townHall: m.townHall === maxTownHall ? 10 : 0,
      missedAttacks: -Math.min(15, missed * 2),
      activity: -((newcomer ? 5 : 0) + (inactive ? 10 : 0)),
    };
    const total = Object.values(breakdown).reduce((sum, part) => sum + part, 0);
    return {
      member: m,
      townHallOk,
      score: Math.max(0, Math.min(100, total)),
      breakdown,
      cwl: {
        ...cwl,
        wars: Math.round(cwlWars),
        attacks: cwlAttacks,
        missed,
        averageStarsPerAttack: cwlAttacks ? cwlStars : 0,
        averageDestruction: cwlAttacks ? round(60 + (cwlStars / 3) * 40) : 0,
      },
      war: {
        wars,
        attacksUsed,
        attacksAvailable,
        averageStarsPerAttack: warStars,
        averageDestruction: attacksUsed ? round(50 + (warStars / 3) * 50) : 0,
      },
      heroes,
      activity: {
        joinedAt: joinedAt?.toISOString() ?? null,
        newcomer,
        inactive,
        recentAttacks: Math.min(attacksUsed, 4),
      },
    };
  });
  scored.sort(
    (a, b) =>
      Number(b.townHallOk) - Number(a.townHallOk) ||
      b.score - a.score ||
      b.member.townHall - a.member.townHall,
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
  const month = (offset: number) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    return date.toISOString().slice(0, 7);
  };
  return {
    generatedAt: now.toISOString(),
    starters: STARTERS,
    reserves: RESERVES,
    maxTownHall,
    minEligibleTownHall: maxTownHall - 1,
    seasons: [1, 2, 3, 4].map(month),
    warWindow: { from: new Date(now.getTime() - 90 * DAY).toISOString(), days: 90, wars: 24 },
    players,
  };
}

function round(value: number, decimals = 1): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
