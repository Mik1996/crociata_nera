import { z } from 'zod';
import { dateTime, model, month, tag } from './common';

/**
 * Clan War League and Raid Weekend data is saved as returned by the Clash of Clans API, so the
 * frontend reuses its mappers: these models list the fields the site reads and accept the others
 * (see the official documentation at developer.clashofclans.com).
 */
const cocDate = (description: string) =>
  z.string().describe(`${description} Clash of Clans API date format, e.g. \`20261030T070000.000Z\`.`);

// ——— Clan War League ———

export const CwlSeasonSummary = model(
  'CwlSeasonSummary',
  'A saved Clan War League season.',
  z.strictObject({
    season: month('Season, `YYYY-MM`.'),
    state: z.string().describe('`preparation`, `inWar` or `ended`.'),
    lastSyncedAt: dateTime('Last read from the Clash of Clans API.'),
  }),
);

const CwlClan = model(
  'CwlClan',
  'A clan of the league group, as returned by `GET /clans/{tag}/currentwar/leaguegroup` (other fields of the API are kept).',
  z.looseObject({
    tag: tag('Clan.'),
    name: z.string().optional().describe('Clan name.'),
    clanLevel: z.number().int().optional().describe('Clan level.'),
    badgeUrls: z.record(z.string(), z.string()).optional().describe('Clan badge URLs by size (`small`, `medium`, `large`).'),
    members: z
      .array(z.looseObject({}).describe('A member: `tag`, `name`, `townHallLevel`.'))
      .optional()
      .describe('Members registered for the season.'),
  }),
);

const CwlWar = model(
  'CwlWar',
  'A war of the group, as returned by `GET /clanwarleagues/wars/{warTag}` (same fields as `currentwar`), with its `warTag`.',
  z.looseObject({
    warTag: z.string().describe('War tag, e.g. `#8QJ0RYPVL`.'),
    state: z.string().describe('`preparation`, `inWar` or `warEnded`.'),
    teamSize: z.number().int().optional().describe('Players per side.'),
    preparationStartTime: cocDate('Start of the preparation day.').optional(),
    startTime: cocDate('Start of the battle day.').optional(),
    endTime: cocDate('End of the battle day.').optional(),
    clan: z.looseObject({}).optional().describe('First side: tag, name, stars, destruction, members with attacks.'),
    opponent: z.looseObject({}).optional().describe('Second side, same fields as `clan`.'),
  }),
);

export const CwlSeasonDetail = model(
  'CwlSeasonDetail',
  'Group and wars of a Clan War League season, kept after the API forgets them.',
  z.strictObject({
    season: month('Season, `YYYY-MM`.'),
    state: z.string().describe('`preparation`, `inWar` or `ended`.'),
    lastSyncedAt: dateTime('Last read from the Clash of Clans API.'),
    clanTag: tag('Our clan.'),
    clans: z.array(CwlClan).describe('The 8 clans of the group.'),
    rounds: z
      .array(
        z
          .strictObject({
            warTags: z.array(z.string()).describe('Tags of the wars of the round (`#0`: not scheduled yet).'),
          })
          .describe('A round.'),
      )
      .describe('The 7 rounds of the season.'),
    wars: z.array(CwlWar).describe('Wars of the group read so far (all clans of the group).'),
  }),
);

// ——— Raid Weekends ———

export const RaidSeason = model(
  'RaidSeason',
  'A Raid Weekend, as returned by `GET /clans/{tag}/capitalraidseasons` (other fields of the API are kept). The API lists the members only while the weekend is in progress: the backend keeps the last list read, so past weekends have them too.',
  z.looseObject({
    state: z.string().describe('`ongoing` or `ended`.'),
    startTime: cocDate('Start of the weekend.'),
    endTime: cocDate('End of the weekend.'),
    capitalTotalLoot: z.number().int().optional().describe('Capital Gold looted by the clan.'),
    raidsCompleted: z.number().int().optional().describe('Raids completed.'),
    totalAttacks: z.number().int().optional().describe('Attacks made.'),
    enemyDistrictsDestroyed: z.number().int().optional().describe('Enemy districts destroyed.'),
    offensiveReward: z.number().int().optional().describe('Raid medals from the attacks.'),
    defensiveReward: z.number().int().optional().describe('Raid medals from the defenses.'),
    members: z
      .array(
        z
          .looseObject({
            tag: tag('Player.'),
            name: z.string().describe('In-game name.'),
            attacks: z.number().int().optional().describe('Attacks made.'),
            attackLimit: z.number().int().optional().describe('Attacks available.'),
            bonusAttackLimit: z.number().int().optional().describe('Bonus attacks available.'),
            capitalResourcesLooted: z.number().int().optional().describe('Capital Gold looted.'),
          })
          .describe('A member who attacked.'),
      )
      .optional()
      .describe('Members who attacked; missing when never read during the weekend.'),
    attackLog: z.array(z.looseObject({})).optional().describe('Raids on other clans, district by district.'),
    defenseLog: z.array(z.looseObject({})).optional().describe("Other clans' raids on our capital."),
  }),
);

// ——— Donations ———

export const DonationSeason = model(
  'DonationSeason',
  'A game season (Gold Pass season) with the troops donated by each player, as counted by the backend: the in-game counter restarts when a player leaves the clan, this total does not.',
  z.strictObject({
    season: month('Season, `YYYY-MM` (month of the middle of the season).'),
    startTime: dateTime('Start of the season.'),
    endTime: dateTime('End of the season.'),
    state: z.enum(['ongoing', 'ended']).describe('`ongoing` or `ended`.'),
    players: z
      .array(
        z
          .strictObject({
            tag: tag('Player.'),
            name: z.string().describe('In-game name.'),
            donations: z.number().int().min(0).describe('Troops donated in the season.'),
          })
          .describe('A player.'),
      )
      .describe('Players, most donations first.'),
  }),
);
