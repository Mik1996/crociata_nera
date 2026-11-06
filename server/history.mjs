// Monthly war history and cumulative player statistics.
//
// Every ended war (`state: warEnded`) is recorded in the month it ended
// (Europe/Rome time zone) in `<dir>/<YYYY-MM>.json`. For each month we store:
//   - `wars`: summary of every war with the individual player rows;
//   - `players`: per-player totals, recomputed by summing the month's wars.
// Recording is idempotent: the same war (same id) replaces the previous one.

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { warId } from './archive.mjs';

const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
});

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Period id of the "all months" aggregate. */
const ALL_PERIODS = 'all';

/** Converts an API date (`20261105T120000.000Z`) to ISO 8601. */
export function parseCocDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(value ?? '');
  if (!m) return value ?? '';
  const [, y, mo, d, h, mi, s, ms = '.000'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${ms}Z`;
}

/** Month (YYYY-MM) of an ISO date, in the Italian time zone. */
export function monthOf(iso) {
  return MONTH_FORMAT.format(new Date(iso)).slice(0, 7);
}

const round = (v, decimals = 2) => Math.round(v * 10 ** decimals) / 10 ** decimals;
const percentage = (part, total) => (total > 0 ? round((part / total) * 100, 1) : 0);

function outcome(clan, opponent) {
  const diff = clan.stars - opponent.stars || clan.destructionPercentage - opponent.destructionPercentage;
  return diff > 0 ? 'victory' : diff < 0 ? 'defeat' : 'draw';
}

/**
 * Compact summary of an ended war, built from the API `currentwar` response.
 * @returns {object | null} null if the war has not ended or data is missing
 */
export function summarizeWar(war) {
  if (war?.state !== 'warEnded' || !war.clan?.members || !war.opponent) return null;
  const attacksPerMember = war.attacksPerMember ?? 2;
  const defenders = new Map((war.opponent.members ?? []).map((m) => [m.tag, m]));
  const sorted = [...war.clan.members].sort((a, b) => a.mapPosition - b.mapPosition);

  return {
    id: warId(war),
    endTime: parseCocDate(war.endTime),
    opponent: war.opponent.name,
    opponentTag: war.opponent.tag,
    teamSize: war.teamSize ?? sorted.length,
    attacksPerMember,
    result: outcome(war.clan, war.opponent),
    stars: war.clan.stars,
    starsConceded: war.opponent.stars,
    destruction: round(war.clan.destructionPercentage),
    destructionConceded: round(war.opponent.destructionPercentage),
    players: sorted.map((m, i) => ({
      tag: m.tag,
      name: m.name,
      townHall: m.townhallLevel,
      mapPosition: i + 1,
      attacksAvailable: attacksPerMember,
      attacks: (m.attacks ?? []).map((a) => {
        const d = defenders.get(a.defenderTag);
        return {
          stars: a.stars,
          destruction: a.destructionPercentage,
          defenderTownHall: d?.townhallLevel ?? null,
          defenderPosition: d?.mapPosition ?? null,
        };
      }),
      opponentAttacks: m.opponentAttacks ?? 0,
      starsConceded: m.bestOpponentAttack?.stars ?? 0,
    })),
  };
}

/**
 * Ranking order: average stars per war (max 6 with 2 attacks),
 * then average destruction, participation and number of wars.
 */
export function comparePlayers(a, b) {
  return (
    b.averageStarsPerWar - a.averageStarsPerWar ||
    b.averageDestruction - a.averageDestruction ||
    b.participation - a.participation ||
    b.wars - a.wars
  );
}

/** Sums the player rows of several wars and computes the averages. */
export function aggregatePlayers(wars) {
  const byTag = new Map();
  const chronological = [...wars].sort((a, b) => a.endTime.localeCompare(b.endTime));

  for (const war of chronological) {
    for (const p of war.players) {
      const t = byTag.get(p.tag) ?? {
        tag: p.tag,
        wars: 0,
        attacksAvailable: 0,
        attacksUsed: 0,
        stars: 0,
        threeStars: 0,
        twoStars: 0,
        oneStar: 0,
        zeroStars: 0,
        totalDestruction: 0,
        opponentAttacks: 0,
        starsConceded: 0,
      };
      // Most recent name and town hall.
      t.name = p.name;
      t.townHall = p.townHall;
      t.lastWar = war.endTime;
      t.wars += 1;
      t.attacksAvailable += p.attacksAvailable;
      t.attacksUsed += p.attacks.length;
      for (const a of p.attacks) {
        t.stars += a.stars;
        t.totalDestruction += a.destruction;
        if (a.stars === 3) t.threeStars += 1;
        else if (a.stars === 2) t.twoStars += 1;
        else if (a.stars === 1) t.oneStar += 1;
        else t.zeroStars += 1;
      }
      t.opponentAttacks += p.opponentAttacks;
      t.starsConceded += p.starsConceded;
      byTag.set(p.tag, t);
    }
  }

  return [...byTag.values()]
    .map(({ totalDestruction, starsConceded, ...t }) => ({
      ...t,
      attacksMissed: t.attacksAvailable - t.attacksUsed,
      averageStarsPerWar: t.wars ? round(t.stars / t.wars) : 0,
      averageStarsPerAttack: t.attacksUsed ? round(t.stars / t.attacksUsed) : 0,
      threeStarRate: percentage(t.threeStars, t.attacksUsed),
      averageDestruction: t.attacksUsed ? round(totalDestruction / t.attacksUsed, 1) : 0,
      participation: percentage(t.attacksUsed, t.attacksAvailable),
      averageStarsConceded: t.wars ? round(starsConceded / t.wars) : 0,
    }))
    .sort(comparePlayers);
}

function periodSummary(period, wars, updatedAt) {
  const sorted = [...wars].sort((a, b) => b.endTime.localeCompare(a.endTime));
  return { period, updatedAt, wars: sorted, players: aggregatePlayers(sorted) };
}

export class MonthlyHistory {
  /** @param {string} dir folder holding the monthly files */
  constructor(dir) {
    this.dir = dir;
    this.writing = Promise.resolve();
  }

  file(month) {
    return join(this.dir, `${month}.json`);
  }

  async readMonth(month) {
    if (!MONTH_REGEX.test(month)) return null;
    try {
      return JSON.parse(await readFile(this.file(month), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async listMonths() {
    try {
      return (await readdir(this.dir))
        .map((f) => f.replace(/\.json$/, ''))
        .filter((m) => MONTH_REGEX.test(m))
        .sort()
        .reverse();
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Records an ended war in its month and recomputes the player totals.
   * @returns {Promise<boolean>} true if the history changed
   */
  record(war) {
    const summary = summarizeWar(war);
    if (!summary) return Promise.resolve(false);

    // Serialised recordings: avoid concurrent reads/writes on the same file.
    const operation = this.writing.then(async () => {
      const month = monthOf(summary.endTime);
      const current = await this.readMonth(month);
      const wars = (current?.wars ?? []).filter((w) => w.id !== summary.id);
      const previous = current?.wars.find((w) => w.id === summary.id);
      if (previous && JSON.stringify(previous) === JSON.stringify(summary)) return false;

      wars.push(summary);
      const data = periodSummary(month, wars, new Date().toISOString());
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.file(month)}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2));
      await rename(tmp, this.file(month));
      return true;
    });
    this.writing = operation.catch(() => undefined);
    return operation;
  }

  /** Summary of every month, most recent first. */
  async months() {
    const result = [];
    for (const month of await this.listMonths()) {
      const data = await this.readMonth(month);
      if (!data) continue;
      const count = (r) => data.wars.filter((w) => w.result === r).length;
      result.push({
        month,
        updatedAt: data.updatedAt,
        wars: data.wars.length,
        victories: count('victory'),
        draws: count('draw'),
        defeats: count('defeat'),
      });
    }
    return result;
  }

  /** Data of one month (or null if absent). */
  async month(month) {
    return this.readMonth(month);
  }

  /** All months combined. */
  async all() {
    const wars = [];
    let updatedAt = null;
    for (const month of await this.listMonths()) {
      const data = await this.readMonth(month);
      if (!data) continue;
      wars.push(...data.wars);
      if (!updatedAt || data.updatedAt > updatedAt) updatedAt = data.updatedAt;
    }
    return periodSummary(ALL_PERIODS, wars, updatedAt);
  }
}
