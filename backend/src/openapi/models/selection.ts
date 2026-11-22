import { z } from 'zod';
import { dateTime, model, month, nullableDateTime, tag } from './common';

const points = (description: string) => z.number().describe(description);

const untilRevoked = z
  .boolean()
  .describe('`true`: for every season until an administrator takes the player back; `false`: for the selection of one season.');

export const CwlExclusion = model(
  'CwlExclusion',
  'Exclusion of a player from the CWL line-up, decided by an administrator.',
  z.strictObject({
    reason: z.string().nullable().describe('Why the player is excluded; `null` when not given.'),
    untilRevoked,
    excludedBy: z.string().describe('Username of the administrator.'),
    excludedAt: dateTime('When the player was excluded.'),
  }),
);

export const CwlExclusionResult = model(
  'CwlExclusionResult',
  'A player just excluded from the CWL line-up.',
  z.strictObject({
    tag: tag('Player.'),
    reason: z.string().nullable().describe('Why the player is excluded; `null` when not given.'),
    untilRevoked,
    excludedBy: z.string().describe('Username of the administrator.'),
    excludedAt: dateTime('When the player was excluded.'),
  }),
);

export const SelectionPlayer = model(
  'CwlSelectionPlayer',
  'A current member of a clan of the Crusade in the ranking for the Clan War League line-up.',
  z.strictObject({
    rank: z.number().int().min(1).describe('Position in the ranking (1 = best).'),
    tag: tag('Player.'),
    name: z.string().describe('In-game name.'),
    clanTag: tag('Clan of the Crusade the player is in.'),
    role: z.string().nullable().describe('Clan role: `member`, `admin` (elder), `coLeader` or `leader`; `null` when unknown.'),
    league: z
      .strictObject({
        id: z.number().int().describe('League id (`leagueTier`): higher ids are higher leagues.'),
        name: z.string().describe('League name, in English.'),
        iconUrl: z.string().nullable().describe('Official icon; `null` when not known.'),
      })
      .nullable()
      .describe('Home village league; `null` when unknown or unranked.'),
    townHallLevel: z.number().int().nullable().describe('Town hall level; `null` when unknown.'),
    eligible: z.boolean().describe('Town hall at most one level below the highest of the clans, and not excluded.'),
    status: z
      .enum(['starter', 'reserve', 'bench', 'ineligible', 'excluded'])
      .describe(
        '`starter` (best 15 eligible), `reserve` (next 3), `bench` (other eligible), `ineligible` (town hall too low) or `excluded` (by an administrator; keeps its place in the ranking, takes no slot).',
      ),
    score: z.number().min(0).max(100).describe('Total score, 0–100: the parts of `breakdown` added up, never below 0.'),
    breakdown: z
      .strictObject({
        cwlCommendations: points('Commendations of the last CWL (Certezza di Lega, Guerriero / Campione / Leggenda di Lega), 0–12.'),
        cwlPerformance: points('Stars per attack and destruction in the league wars of the last CWL, 0–13.'),
        war: points('Regular wars of the window, 0–40; 0–65 for who was not in the last CWL (see `war.maxPoints`).'),
        heroes: points('Hero levels and equipped hero equipment, 0–20.'),
        townHall: points('10 for the highest town hall of the clans, else 0.'),
        league: points('Home village league, 0–5: Electro League 31 = 1, 32 = 2, 33 = 3, Legend III = 4, Legend II and I = 5, lower leagues 0.'),
        missedAttacks: points('Penalty for the league attacks missed in the last CWL, -15–0.'),
        activity: points('Penalty for a new arrival in the clans of the Crusade (-5), else 0.'),
      })
      .describe('Parts of the score.'),
    war: z
      .strictObject({
        wars: z.number().int().describe('Regular wars played in the window, in any clan of the Crusade.'),
        attacksUsed: z.number().int().describe('Attacks done.'),
        attacksAvailable: z.number().int().describe('Attacks available.'),
        averageStarsPerAttack: z.number().describe('Average stars per attack done.'),
        averageDestruction: z.number().describe('Average destruction per attack done (%).'),
        maxPoints: z.number().int().describe('Most points of the regular wars: 40, or 65 for who was not in the last CWL.'),
      })
      .describe('Regular wars of the window.'),
    cwl: z
      .strictObject({
        clanTag: tag('Clan of the Crusade the player fought the CWL with.'),
        allAttacks: z.boolean().describe('Earned `cwlAllAttacks` (Certezza di Lega).'),
        striker: z.enum(['gold', 'silver', 'bronze']).nullable().describe('Tier of `cwlStriker` earned; `null` for none.'),
        wars: z.number().int().describe('League wars in the line-up.'),
        attacks: z.number().int().describe('League attacks done.'),
        missed: z.number().int().describe('League attacks missed.'),
        averageStarsPerAttack: z.number().describe('Average stars per league attack.'),
        averageDestruction: z.number().describe('Average destruction per league attack (%).'),
      })
      .nullable()
      .describe('The last CWL; `null` when the player was not in its line-up.'),
    heroes: z
      .strictObject({
        levels: z.number().describe('Hero levels against the highest of the game (%).'),
        equipment: z.number().describe('Equipped hero equipment against its highest level (%).'),
      })
      .nullable()
      .describe('Heroes; `null` while the player profile was never read.'),
    activity: z
      .strictObject({
        joinedAt: nullableDateTime('When the player joined the clans of the Crusade; `null` when unknown.'),
        newcomer: z.boolean().describe('In the clans of the Crusade for less than 14 days.'),
      })
      .describe('Activity.'),
    exclusion: CwlExclusion.nullable().describe('Exclusion by an administrator; `null` when not excluded.'),
  }),
);

export const CwlSelection = model(
  'CwlSelection',
  'The selection of a season for the Clan War League line-up: the ranking of the members of the clans of the Crusade, best first (players with an eligible town hall by score; ties: town hall, league, role; then the others), live while the selection is open, frozen once closed.',
  z.strictObject({
    season: month('Season of the CWL the selection is for, `YYYY-MM`.'),
    state: z.enum(['open', 'closed']).describe('`open`: live ranking, administrators exclude players; `closed`: the ranking frozen when it was closed.'),
    signupStart: dateTime('First day of the season (UTC): the CWL sign-ups open then, the selection should be closed by it.'),
    closedAt: nullableDateTime('When it was closed; `null` while open.'),
    closedBy: z.string().nullable().describe('Username of the administrator who closed it; `null` while open or when closed automatically.'),
    closedAutomatically: z.boolean().describe('Closed by the backend when the CWL of the season started.'),
    canReopen: z.boolean().describe('Closed, its CWL not started yet and no later season closed: an administrator can open it again.'),
    seasons: z
      .array(z.strictObject({ season: month('Season, `YYYY-MM`.'), state: z.enum(['open', 'closed']).describe('State of its selection.') }))
      .describe('Every selection, most recent first.'),
    generatedAt: dateTime('When the ranking was computed (closed: when it was closed).'),
    starters: z.number().int().describe('Players in the line-up (15).'),
    reserves: z.number().int().describe('Reserves (3).'),
    maxTownHall: z.number().int().nullable().describe('Highest town hall of the clans of the Crusade; `null` without members.'),
    minEligibleTownHall: z.number().int().nullable().describe('Lowest eligible town hall; `null` without members.'),
    cwlSeason: month('Season, `YYYY-MM`.').nullable().describe('Last ended CWL season of the clans of the Crusade; `null` if none was saved.'),
    warWindow: z
      .strictObject({
        from: dateTime('Start of the window.'),
        days: z.number().int().describe('Length of the window in days.'),
        wars: z.number().int().describe('Regular wars of the clans of the Crusade ended in the window.'),
      })
      .describe('Regular wars counted.'),
    players: z.array(SelectionPlayer).describe('Current members, best first.'),
  }),
);
