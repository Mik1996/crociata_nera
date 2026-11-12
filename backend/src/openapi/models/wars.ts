import { z } from 'zod';
import { dateTime, model, month, nullableDateTime, page, tag } from './common';

const warState = z
  .enum(['preparation', 'inWar', 'warEnded'])
  .describe('`preparation` (preparation day), `inWar` (battle day) or `warEnded`.');
const percentage = (description: string) => z.number().min(0).max(100).describe(description);
const count = (description: string) => z.number().int().min(0).describe(description);
const battleModifier = z.string().describe('`none`, or `hardMode` for wars with the hard mode modifier.');

export const WarAttack = model(
  'WarAttack',
  'An attack of a war.',
  z.strictObject({
    attackerTag: tag('Attacker.'),
    defenderTag: tag('Defender.'),
    stars: z.number().int().min(0).max(3).describe('Stars won, 0–3.'),
    destructionPercentage: percentage('Destruction of the base, 0–100.'),
    order: z.number().int().min(1).describe('Order of the attack in the war, from 1.'),
    duration: z.number().int().min(0).nullable().describe('Duration in seconds; `null` when unknown.'),
  }),
);

export const WarMember = model(
  'WarMember',
  'A player of a war, with their attacks.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    townhallLevel: z.number().int().min(1).describe('Town hall level.'),
    mapPosition: z.number().int().min(1).describe('Position on the war map, from 1 (top).'),
    attacks: z.array(WarAttack).describe('Attacks made (empty when none).'),
    opponentAttacks: count('Attacks received.'),
    bestOpponentAttack: WarAttack.nullable().describe('Best attack received; `null` when none.'),
  }),
);

const sideSummaryShape = {
  tag: tag('Clan.'),
  name: z.string().describe('Clan name.'),
  clanLevel: z.number().int().min(0).describe('Clan level.'),
  badgeUrl: z.string().nullable().describe('URL of the clan badge (largest size available); `null` when unknown.'),
  attacks: count('Attacks used.'),
  stars: count('Stars won.'),
  destructionPercentage: percentage('Average destruction, 0–100.'),
  expEarned: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Clan XP earned (from the war log, once the war has ended); `null` when unknown.'),
};

export const WarSideSummary = model('WarSideSummary', 'A side of a war, without its players.', z.strictObject(sideSummaryShape));

export const WarSide = model(
  'WarSide',
  'A side of a war with its players.',
  z.strictObject({ ...sideSummaryShape, members: z.array(WarMember).describe('Players of the side.') }),
);

const warShape = {
  warKey: z
    .string()
    .describe('War id: preparation start (UTC) and opponent tag, `YYYYMMDDTHHMMSS-OPPONENTTAG`, e.g. `20261104T100000-OPP999`.'),
  clanTag: tag('Our clan.'),
  state: warState,
  result: z.enum(['win', 'lose', 'tie']).nullable().describe('Result for our clan once the war has ended; `null` before.'),
  teamSize: z.number().int().min(1).describe('Players per side.'),
  attacksPerMember: z.number().int().min(1).describe('Attacks per player.'),
  battleModifier,
  preparationStartTime: dateTime('Start of the preparation day.'),
  startTime: dateTime('Start of the battle day.'),
  endTime: dateTime('End of the battle day.'),
  endedAt: nullableDateTime('When the war was saved as ended; `null` while in progress.'),
  finalizedFrom: z
    .enum(['currentWar', 'lastSnapshot'])
    .nullable()
    .describe(
      'How the final state was obtained: `currentWar` (read while the API showed it ended: complete data) or `lastSnapshot` (never seen ended, closed from the last battle-day read and corrected with the war log). `null` while in progress.',
    ),
  warLogMatched: z.boolean().describe('Final stars, destruction, result and XP were checked against the war log.'),
  lastSyncedAt: dateTime('Last read from the Clash of Clans API.'),
};

export const WarSummary = model(
  'WarSummary',
  'A war saved by the backend, without the players.',
  z.strictObject({ ...warShape, clan: WarSideSummary, opponent: WarSideSummary }),
);

export const WarDetail = model(
  'WarDetail',
  'A war saved by the backend, with players and attacks.',
  z.strictObject({ ...warShape, clan: WarSide, opponent: WarSide, createdAt: dateTime('First save of the war.') }),
);

export const WarPage = model('WarPage', 'A page of wars, most recent first.', z.strictObject(page(WarSummary, 'Wars of the page.')));

// ——— Archive: wars in the `currentwar` format of the Clash of Clans API ———

const cocDate = (description: string) =>
  z
    .string()
    .regex(/^\d{8}T\d{6}\.\d{3}Z$/)
    .describe(`${description} Clash of Clans API date format, e.g. \`20261104T100000.000Z\`.`);

const CocWarAttack = model(
  'CocWarAttack',
  'An attack, as in the Clash of Clans API.',
  z.strictObject({
    attackerTag: tag('Attacker.'),
    defenderTag: tag('Defender.'),
    stars: z.number().int().min(0).max(3).describe('Stars won, 0–3.'),
    destructionPercentage: percentage('Destruction of the base, 0–100.'),
    order: z.number().int().min(1).describe('Order of the attack in the war, from 1.'),
    duration: z.number().int().min(0).optional().describe('Duration in seconds, when known.'),
  }),
);

const CocWarMember = model(
  'CocWarMember',
  'A player of a war, as in the Clash of Clans API.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    townhallLevel: z.number().int().min(1).describe('Town hall level.'),
    mapPosition: z.number().int().min(1).describe('Position on the war map, from 1 (top).'),
    opponentAttacks: count('Attacks received.'),
    attacks: z.array(CocWarAttack).describe('Attacks made.'),
    bestOpponentAttack: CocWarAttack.optional().describe('Best attack received, when any.'),
  }),
);

const CocWarSide = model(
  'CocWarSide',
  'A side of a war, as in the Clash of Clans API.',
  z.strictObject({
    tag: tag('Clan.'),
    name: z.string().describe('Clan name.'),
    clanLevel: z.number().int().min(0).describe('Clan level.'),
    badgeUrls: z
      .strictObject({
        small: z.string().describe('Badge URL.'),
        medium: z.string().describe('Badge URL.'),
        large: z.string().describe('Badge URL.'),
      })
      .optional()
      .describe('Clan badge (the same URL in every size), when known.'),
    attacks: count('Attacks used.'),
    stars: count('Stars won.'),
    destructionPercentage: percentage('Average destruction, 0–100.'),
    expEarned: count('Clan XP earned, when known.').optional(),
    members: z.array(CocWarMember).describe('Players of the side.'),
  }),
);

export const CocWar = model(
  'CocWar',
  'A saved war in the format of `GET /clans/{tag}/currentwar` of the Clash of Clans API.',
  z.strictObject({
    state: warState,
    teamSize: z.number().int().min(1).describe('Players per side.'),
    attacksPerMember: z.number().int().min(1).describe('Attacks per player.'),
    battleModifier,
    preparationStartTime: cocDate('Start of the preparation day.'),
    startTime: cocDate('Start of the battle day.'),
    endTime: cocDate('End of the battle day.'),
    clan: CocWarSide,
    opponent: CocWarSide,
  }),
);

// ——— Monthly history and rankings ———

export const MonthSummary = model(
  'MonthSummary',
  'A month with ended wars.',
  z.strictObject({
    month: month('Month, `YYYY-MM` (Europe/Rome time zone).'),
    updatedAt: dateTime('Last change to the saved wars.'),
    wars: count('Ended wars of the month.'),
    victories: count('Wars won.'),
    draws: count('Wars tied.'),
    defeats: count('Wars lost.'),
  }),
);

const HistoryAttack = model(
  'HistoryAttack',
  'An attack in the history.',
  z.strictObject({
    stars: z.number().int().min(0).max(3).describe('Stars won, 0–3.'),
    destruction: percentage('Destruction, 0–100.'),
    defenderTownHall: z.number().int().nullable().describe('Town hall level of the defender; `null` when unknown.'),
    defenderPosition: z.number().int().nullable().describe('Map position of the defender; `null` when unknown.'),
  }),
);

const HistoryWarPlayer = model(
  'HistoryWarPlayer',
  'A player of our clan in a war of the history.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('In-game name at the time of the war.'),
    townHall: z.number().int().describe('Town hall level.'),
    mapPosition: z.number().int().describe('Position on the war map.'),
    attacksAvailable: count('Attacks the player could make.'),
    attacks: z.array(HistoryAttack).describe('Attacks made.'),
    opponentAttacks: count('Attacks received.'),
    starsConceded: count('Stars of the best attack received.'),
  }),
);

const HistoryWar = model(
  'HistoryWar',
  'An ended war in the history.',
  z.strictObject({
    id: z.string().describe('War id (`warKey`).'),
    endTime: dateTime('End of the war.'),
    opponent: z.string().describe('Opponent clan name.'),
    opponentTag: tag('Opponent clan.'),
    teamSize: z.number().int().describe('Players per side.'),
    attacksPerMember: z.number().int().describe('Attacks per player.'),
    result: z.enum(['victory', 'defeat', 'draw']).describe('Result for our clan.'),
    stars: count('Stars won.'),
    starsConceded: count('Stars conceded.'),
    destruction: percentage('Our destruction, 0–100.'),
    destructionConceded: percentage("The opponent's destruction, 0–100."),
    players: z.array(HistoryWarPlayer).describe('Our players, by map position.'),
  }),
);

const HistoryPlayerStats = model(
  'HistoryPlayerStats',
  'Totals and averages of a player over the wars of a period.',
  z.strictObject({
    tag: tag('Player.'),
    name: z.string().describe('Latest in-game name.'),
    townHall: z.number().int().describe('Latest town hall level.'),
    lastWar: dateTime('End of the last war played in the period.'),
    wars: count('Wars played.'),
    attacksAvailable: count('Attacks available.'),
    attacksUsed: count('Attacks made.'),
    attacksMissed: count('Attacks not made.'),
    stars: count('Stars won.'),
    threeStars: count('Attacks with 3 stars.'),
    twoStars: count('Attacks with 2 stars.'),
    oneStar: count('Attacks with 1 star.'),
    zeroStars: count('Attacks with no stars.'),
    averageStarsPerWar: z.number().min(0).describe('Stars per war played (ranking criterion), 2 decimals.'),
    averageStarsPerAttack: z.number().min(0).describe('Stars per attack made, 2 decimals.'),
    threeStarRate: percentage('Attacks with 3 stars, % of the attacks made.'),
    averageDestruction: percentage('Average destruction per attack, 0–100.'),
    participation: percentage('Attacks made, % of the attacks available.'),
    opponentAttacks: count('Attacks received.'),
    averageStarsConceded: z.number().min(0).describe('Stars conceded per war, 2 decimals.'),
  }),
);

export const HistoryPeriod = model(
  'HistoryPeriod',
  'Wars and player ranking of a month or of all time.',
  z.strictObject({
    period: z.string().describe('`YYYY-MM` or `all`.'),
    updatedAt: nullableDateTime('Last change to the saved wars; `null` without wars.'),
    wars: z.array(HistoryWar).describe('Ended wars of the period, most recent first.'),
    players: z
      .array(HistoryPlayerStats)
      .describe('Ranking: average stars per war, then average destruction, participation and wars played.'),
  }),
);
