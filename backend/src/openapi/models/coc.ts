import { z } from 'zod';
import { model, tag } from './common';

/**
 * Responses of the Clash of Clans API passed on by the backend (`GET /clan`, `GET /wars/warlog`,
 * `GET /players/{tag}/profile`, `GET /welcome`). They keep the format of the official API: the
 * main fields are listed, the others come as the API sends them (loose objects).
 */

const role = z.string().describe('Clan role as the API names it: `leader`, `coLeader`, `admin` (elder) or `member`.');
const iconUrls = z.looseObject({}).describe('Icon URLs by size (`small`, `medium`, `large`…).');
const named = (description: string) =>
  z.looseObject({ id: z.number().int().describe('Id.'), name: z.string().describe('Name, in English.') }).describe(description);

export const CocClanMember = model(
  'CocClanMember',
  'A member of a clan, as `memberList[]` of `GET /clans/{tag}`.',
  z.looseObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    role,
    townHallLevel: z.number().int().optional().describe('Town hall level.'),
    expLevel: z.number().int().optional().describe('Experience level.'),
    trophies: z.number().int().optional().describe('Trophies.'),
    leagueTier: named('Home village league, with `iconUrls`.').optional(),
    donations: z.number().int().optional().describe('Troops donated this season (reset when leaving the clan).'),
    donationsReceived: z.number().int().optional().describe('Troops received this season.'),
  }),
);

const clanShape = {
  tag: tag('Clan.'),
  name: z.string().describe('Clan name.'),
  type: z.string().optional().describe('`open`, `inviteOnly` or `closed`.'),
  description: z.string().optional().describe('Description written by the leaders.'),
  location: named('Country or region, with `countryCode`.').optional(),
  badgeUrls: iconUrls.optional(),
  clanLevel: z.number().int().optional().describe('Clan level.'),
  clanPoints: z.number().int().optional().describe('Trophies of the clan.'),
  clanCapitalPoints: z.number().int().optional().describe('Clan Capital trophies.'),
  capitalLeague: named('Clan Capital league.').optional(),
  requiredTrophies: z.number().int().optional().describe('Trophies needed to join.'),
  requiredTownhallLevel: z.number().int().optional().describe('Town hall needed to join.'),
  requiredLeagueTier: named('League needed to join, with `iconUrls`.').optional(),
  warWinStreak: z.number().int().optional().describe('Wars won in a row.'),
  warWins: z.number().int().optional().describe('Wars won.'),
  warTies: z.number().int().optional().describe('Wars tied (only with a public war log).'),
  warLosses: z.number().int().optional().describe('Wars lost (only with a public war log).'),
  isWarLogPublic: z.boolean().optional().describe('The war log (and the current war) can be read.'),
  warLeague: named('Clan War League.').optional(),
  members: z.number().int().optional().describe('Number of members.'),
  labels: z.array(z.looseObject({}).describe('A label, with `id`, `name`, `iconUrls`.')).optional().describe('Clan labels.'),
  clanCapital: z.looseObject({}).optional().describe('Clan Capital: `capitalHallLevel` and `districts`.'),
  chatLanguage: named('Chat language.').optional(),
};

export const CocClan = model(
  'CocClan',
  'A clan with its members, as `GET /clans/{tag}` of the Clash of Clans API returns it.',
  z.looseObject({ ...clanShape, memberList: z.array(CocClanMember).describe('Members.') }),
);

export const CocWarLogEntry = model(
  'CocWarLogEntry',
  'A war of the war log, as `items[]` of `GET /clans/{tag}/warlog` (Clan War League wars have no opponent tag and no result).',
  z.looseObject({
    result: z.enum(['win', 'lose', 'tie']).nullable().optional().describe('Result for the clan; `null` for league wars.'),
    endTime: z.string().describe('End of the war, `20261105T120000.000Z`.'),
    teamSize: z.number().int().describe('Players per side.'),
    attacksPerMember: z.number().int().optional().describe('Attacks per player.'),
    clan: z.looseObject({}).describe('The clan: `tag`, `name`, `stars`, `destructionPercentage`, `attacks`, `expEarned`…'),
    opponent: z.looseObject({}).describe('The opponent: `tag`, `name`, `stars`, `destructionPercentage`… (no tag for league wars).'),
  }),
);

export const CocPlayer = model(
  'CocPlayer',
  'A player, as `GET /players/{tag}` of the Clash of Clans API returns it (heroes, troops, spells, achievements…).',
  z.looseObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    townHallLevel: z.number().int().describe('Town hall level.'),
    expLevel: z.number().int().optional().describe('Experience level.'),
    trophies: z.number().int().optional().describe('Trophies.'),
    clan: z.looseObject({}).optional().describe('Clan of the player, when in one.'),
    role: role.optional(),
  }),
);

export const Membership = model(
  'Membership',
  "A linked account that is in a clan of the Crusade now.",
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    role: z.enum(['leader', 'coLeader', 'elder', 'member']).describe('Role in the clan.'),
    townHallLevel: z.number().int().nullable().describe('Town hall level; null when unknown.'),
    clanTag: tag('Clan of the Crusade the account is in.'),
    clanName: z.string().describe('Name of that clan.'),
  }),
);

const WelcomeClan = model(
  'WelcomeClan',
  'A clan of the Crusade as the welcome page shows it: the public fields of `GET /clans/{tag}`, the members by name and role only.',
  z.looseObject({
    ...clanShape,
    memberList: z
      .array(z.strictObject({ name: z.string().describe('In-game name.'), role }).describe('A member.'))
      .describe('Members, by name and role only.'),
  }),
);

export const Welcome = model(
  'Welcome',
  'Public data of the welcome page, the "Join us" page and the badge in the header.',
  z.strictObject({
    clans: z.array(WelcomeClan).describe('The clans of the Crusade, the main one first (a clan that cannot be read is left out).'),
    ranks: z
      .strictObject({
        local: z.number().int().nullable().optional().describe("Position in the country's trophy ranking; `null` beyond the top 200; missing when unknown."),
        global: z.number().int().nullable().optional().describe('Position in the worldwide trophy ranking; `null` beyond the top 200; missing when unknown.'),
      })
      .describe('Positions of the main clan in the trophy rankings.'),
  }),
);
