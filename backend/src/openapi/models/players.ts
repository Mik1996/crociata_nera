import { z } from 'zod';
import { COMMENDATION_TIERS, COMMENDATION_TYPES } from '@/modules/commendations/commendation-rules';
import { model, nullableDateTime, tag } from './common';

export const EarnedCommendation = model(
  'EarnedCommendation',
  'A commendation earned by a player. Awarded once per closed period (month, Raid Weekend, CWL season, game season) and frozen: later rule changes do not alter it.',
  z.strictObject({
    id: z.string().describe('Unique id in the catalogue, e.g. `95000003`.'),
    name: z.string().describe('`<type>-<tier>`, e.g. `champion-gold` (also the name of the medal image).'),
    type: z.enum(COMMENDATION_TYPES as [string, ...string[]]).describe('Kind of commendation.'),
    tier: z.enum(COMMENDATION_TIERS as [string, ...string[]]).describe('Tier; `legendary` for one-off commendations.'),
    quantity: z.number().int().min(1).describe('Times earned.'),
  }),
);

export const PlayerRecord = model(
  'PlayerRecord',
  'A player of the clan (current or former) with the data last read from Clash of Clans and the commendations earned.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    role: z.string().nullable().describe('Clan role: `member`, `admin` (elder), `coLeader` or `leader`; `null` when unknown.'),
    townHallLevel: z.number().int().nullable().describe('Town hall level; `null` when unknown.'),
    expLevel: z.number().int().nullable().describe('Experience level; `null` when unknown.'),
    trophies: z.number().int().nullable().describe('Trophies; `null` when unknown.'),
    league: z
      .strictObject({
        id: z.number().int().describe('League id.'),
        name: z.string().describe('League name (English).'),
        iconUrl: z.string().optional().describe('League icon URL.'),
      })
      .nullable()
      .describe('League tier; `null` when unknown.'),
    inClan: z.boolean().describe('`false` once the player has left the clan.'),
    lastSeenAt: nullableDateTime('Last time the player was seen in the clan member list.'),
    commendations: z.array(EarnedCommendation).describe('Commendations earned.'),
  }),
);

const record = (description: string) =>
  z
    .strictObject({
      value: z.number().int().describe('Best value.'),
      achievedAt: nullableDateTime('When it was reached; `null` for the records set before the backend tracked them.'),
    })
    .describe(description);

export const ClanRecords = model(
  'ClanRecords',
  'All-time records of the clan. They only improve: the synchronisation saves a value when the Clash of Clans API shows a better one.',
  z.strictObject({
    perfectWars: record('Wars won with every star.'),
    warWinStreak: record('Longest series of consecutive war wins.'),
    cwlLeague: z
      .strictObject({
        id: z.number().int().describe('League id (ids grow with the rank).'),
        name: z.string().describe('League name (English), e.g. `Master League I`.'),
        achievedAt: nullableDateTime('When it was reached; `null` for the record set before the backend tracked it.'),
      })
      .describe('Highest Clan War League reached.'),
    localRank: record("Best position in the clan rankings of the clan's country (1 = first)."),
    localCapitalRank: record("Best position in the Clan Capital rankings of the clan's country."),
    capitalPoints: record('Most Clan Capital trophies.'),
  }),
);
