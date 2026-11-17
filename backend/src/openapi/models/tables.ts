import { z } from 'zod';
import { dateTime, model, tag } from './common';
import { SelectionPlayer } from './selection';
import { HistoryPlayerStats, HistoryWar } from './wars';
import { tablePageShape } from '../table';

/** Response models of the tables filtered, sorted and paged by the backend. */

const percentage = (description: string) => z.number().min(0).max(100).describe(description);
const count = (description: string) => z.number().int().min(0).describe(description);
const result = z.enum(['victory', 'defeat', 'draw']).describe('Result for the clan.');
const league = z
  .strictObject({
    id: z.number().int().describe('League id (`leagueTier`): higher ids are higher leagues.'),
    name: z.string().describe('League name, in English.'),
    iconUrl: z.string().nullable().describe('Official icon; `null` when not known.'),
  })
  .nullable()
  .describe('Home village league; `null` when unranked.');

// --- War history ---------------------------------------------------------------------------------

const WarHistoryRow = model(
  'WarHistoryRow',
  'An ended war of the clan.',
  z.strictObject({
    id: z.string().describe('War id: the `warKey` of a saved war, `warlog-<end>-<opponent>` for a war known only from the war log.'),
    date: dateTime('End of the battle day.'),
    opponent: z.string().describe('Opponent clan name.'),
    opponentTag: tag('Opponent clan.'),
    teamSize: count('Players per side.'),
    result,
    stars: count('Stars of the clan.'),
    starsConceded: count('Stars of the opponent.'),
    destruction: percentage('Destruction by the clan, 0–100.'),
    destructionConceded: percentage('Destruction by the opponent, 0–100.'),
    hasDetails: z.boolean().describe('Players and attacks are known (`false`: summary from the war log only).'),
  }),
);

export const WarHistoryPage = model(
  'WarHistoryPage',
  'A page of the war history, with the record of every war.',
  z.strictObject({
    ...tablePageShape(WarHistoryRow, 'Wars of the page.'),
    summary: z
      .strictObject({
        wars: count('Ended wars (all, not only the matching ones).'),
        victories: count('Wars won.'),
        defeats: count('Wars lost.'),
        draws: count('Wars tied.'),
      })
      .describe('Record of every ended war.'),
  }),
);

// --- Participants of a war -----------------------------------------------------------------------

const ParticipantRow = model(
  'WarParticipantRow',
  'A player of the clan in a war, with their attacks.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    mapPosition: z.number().int().min(1).describe('Position on the war map, from 1 (top).'),
    townHall: z.number().int().describe('Town hall level.'),
    attacksUsed: count('Attacks made.'),
    attacksAvailable: count('Attacks per player in the war.'),
    stars: count('Stars won.'),
    averageDestruction: percentage('Average destruction of the attacks, 0–100 (0 without attacks).'),
    hasAttacked: z.boolean().describe('At least one attack made.'),
    targets: z
      .array(
        z
          .strictObject({
            mapPosition: z.number().int().describe('Position of the defender on the war map (0 when unknown).'),
            name: z.string().describe('Name of the defender (its tag when unknown).'),
            townHall: z.number().int().describe('Town hall level of the defender (0 when unknown).'),
            stars: z.number().int().min(0).max(3).describe('Stars won.'),
            destruction: percentage('Destruction, 0–100.'),
          })
          .describe('An attack and its target.'),
      )
      .describe('The attacks, in order.'),
  }),
);

export const ParticipantsPage = model(
  'WarParticipantsPage',
  'A page of the players of the clan in a war.',
  z.strictObject({
    ...tablePageShape(ParticipantRow, 'Players of the page.'),
    summary: z
      .strictObject({
        townHalls: z.array(z.number().int()).describe('Town halls of the players in the war, highest first (options of the town hall filter).'),
      })
      .describe('About every player of the war.'),
  }),
);

// --- Members and their wars ----------------------------------------------------------------------

const MemberStatsRow = model(
  'MemberStatsRow',
  'A member of the clan with their war statistics over the last wars with players.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    role: z.enum(['leader', 'coLeader', 'elder', 'member']).describe('Clan role.'),
    townHall: z.number().int().describe('Town hall level.'),
    league,
    trophies: z.number().int().describe('Trophies.'),
    warsPlayed: count('Wars in which the player was lined up.'),
    warsTotal: count('Wars looked at (the last 20 with players).'),
    attendance: percentage('Wars played, % of the wars looked at.'),
    attacksAvailable: count('Attacks available in the wars played.'),
    attacksUsed: count('Attacks made.'),
    totalStars: count('Stars won.'),
    averageStars: z.number().min(0).describe('Stars per attack made, 2 decimals.'),
    threeStarRate: percentage('Attacks with 3 stars, % of the attacks made.'),
    averageDestruction: percentage('Average destruction per attack, 0–100.'),
  }),
);

const average = (description: string) => z.number().min(0).describe(`Average ${description} of the matching members.`);

export const MemberStatsPage = model(
  'MemberStatsPage',
  'A page of the members of the clan with their war statistics.',
  z.strictObject({
    ...tablePageShape(MemberStatsRow, 'Members of the page.'),
    summary: z
      .strictObject({
        members: count('Members of the clan (all, not only the matching ones).'),
        warsTotal: count('Wars looked at (`0`: no war with players saved yet).'),
        leagues: z
          .array(z.strictObject({ id: z.number().int().describe('League id.'), name: z.string().describe('League name.') }).describe('A league.'))
          .describe('Leagues of the members, highest first (options of the league filter).'),
        averages: z
          .strictObject({
            townHall: average('town hall'),
            warsPlayed: average('wars played'),
            attendance: average('attendance (%)'),
            attacksUsed: average('attacks made'),
            attacksAvailable: average('attacks available'),
            totalStars: average('stars'),
            averageStars: average('stars per attack'),
            threeStarRate: average('3-star rate (%)'),
            averageDestruction: average('destruction (%)'),
          })
          .nullable()
          .describe('Averages over every matching member (all pages); `null` when none matches.'),
      })
      .describe('About the members.'),
  }),
);

const PlayerWarRow = model(
  'PlayerWarRow',
  "A player's performance in a war of the clan.",
  z.strictObject({
    warId: z.string().describe('War id (`warKey`).'),
    date: dateTime('End of the war.'),
    opponent: z.string().describe('Opponent clan name.'),
    result,
    townHall: z.number().int().describe('Town hall level of the player in the war.'),
    mapPosition: z.number().int().min(1).describe('Position on the war map.'),
    attacksUsed: count('Attacks made.'),
    attacksAvailable: count('Attacks available.'),
    stars: count('Stars won.'),
    averageDestruction: percentage('Average destruction of the attacks, 0–100 (0 without attacks).'),
  }),
);

export const PlayerWarsPage = model(
  'PlayerWarsPage',
  'A page of the wars of a player among the last 20 wars of the clan with players.',
  z.strictObject(tablePageShape(PlayerWarRow, 'Wars of the page.')),
);

// --- Statistics ----------------------------------------------------------------------------------

const RankingRow = model(
  'RankingRow',
  'A player in the ranking of a period.',
  HistoryPlayerStats.extend({
    rank: z.number().int().min(1).describe('Position in the whole ranking (by average stars per war).'),
    isCurrentMember: z.boolean().describe('In a clan of the Crusade now (`true` when the member lists cannot be read).'),
  }),
);

export const RankingPage = model(
  'RankingPage',
  'A page of the ranking of the players of a period.',
  z.strictObject(tablePageShape(RankingRow, 'Players of the page.')),
);

const PeriodWarRow = model('PeriodWarRow', 'An ended war of a period, without its players.', HistoryWar.omit({ players: true }));

export const PeriodWarsPage = model(
  'PeriodWarsPage',
  'A page of the wars of a period.',
  z.strictObject(tablePageShape(PeriodWarRow, 'Wars of the page.')),
);

// --- Clan War League -----------------------------------------------------------------------------

const CwlPlayerRow = model(
  'CwlPlayerRow',
  'A player of the clan in a Clan War League season, over the clan war of each round.',
  z.strictObject({
    index: z.number().int().min(1).describe('Position in the whole list (most stars first, then average stars).'),
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    townHall: z.number().int().describe('Town hall level.'),
    wars: count('League wars in the line-up already started (attacks available so far).'),
    attacks: count('Attacks made.'),
    stars: count('Stars won.'),
    threeStars: count('Attacks with 3 stars.'),
    averageStars: z.number().min(0).describe('Stars per attack made, 2 decimals.'),
    averageDestruction: percentage('Average destruction per attack, 0–100.'),
  }),
);

export const CwlPlayersPage = model(
  'CwlPlayersPage',
  'A page of the players of the clan in a Clan War League season.',
  z.strictObject(tablePageShape(CwlPlayerRow, 'Players of the page.')),
);

export const SelectionPlayersPage = model(
  'CwlSelectionPlayersPage',
  'A page of the ranking for the Clan War League line-up.',
  z.strictObject(tablePageShape(SelectionPlayer, 'Players of the page.')),
);

// --- Raid Weekend --------------------------------------------------------------------------------

const RaidMemberRow = model(
  'RaidMemberRow',
  'A member of the clan who attacked in a Raid Weekend.',
  z.strictObject({
    rank: z.number().int().min(1).describe('Position in the whole list (most Capital Gold looted first).'),
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    attacks: count('Attacks made.'),
    attackLimit: count('Attacks available, bonus attacks included.'),
    looted: z.number().min(0).describe('Capital Gold looted.'),
  }),
);

export const RaidMembersPage = model(
  'RaidMembersPage',
  'A page of the members who attacked in a Raid Weekend.',
  z.strictObject({
    ...tablePageShape(RaidMemberRow, 'Members of the page.'),
    summary: z
      .strictObject({
        attacks: count('Attacks of the matching members (all pages).'),
        attackLimit: count('Attacks available to the matching members.'),
        looted: z.number().min(0).describe('Capital Gold looted by the matching members.'),
      })
      .describe('Totals over every matching member.'),
  }),
);
