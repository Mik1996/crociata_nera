import { z } from 'zod';

/**
 * Schemas of the Clash of Clans API responses read by the war sync, and of the
 * war list query. Unknown fields are dropped.
 */
const tag = z.string().regex(/^#[0-9A-Z]{3,15}$/i).transform((t) => t.toUpperCase());
const count = z.number().int().min(0);
const percentage = z.number().min(0).max(100);

/** API date format: `20261105T120000.000Z`. */
export const cocDate = z
  .string()
  .regex(/^\d{8}T\d{6}(\.\d{3})?Z$/)
  .transform((value) => {
    const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(value)!;
    return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!));
  });

const badgeUrls = z
  .object({ small: z.url().optional(), medium: z.url().optional(), large: z.url().optional() })
  .optional();

const attackSchema = z.object({
  attackerTag: tag,
  defenderTag: tag,
  stars: z.number().int().min(0).max(3),
  destructionPercentage: percentage,
  order: z.number().int().min(1),
  duration: count.optional(),
});

const memberSchema = z.object({
  tag,
  name: z.string().max(64),
  townhallLevel: z.number().int().min(1).max(30),
  mapPosition: z.number().int().min(1).max(100),
  attacks: z.array(attackSchema).max(4).optional(),
  opponentAttacks: count.default(0),
  bestOpponentAttack: attackSchema.optional(),
});

const sideSchema = z.object({
  tag,
  name: z.string().max(64),
  clanLevel: z.number().int().min(0),
  badgeUrls,
  attacks: count.default(0),
  stars: count,
  destructionPercentage: percentage,
  expEarned: count.optional(),
  members: z.array(memberSchema).max(100).default([]),
});

/** `GET /clans/{tag}/currentwar` when the clan is in a war (preparation, battle day or ended). */
export const cocWarSchema = z.object({
  state: z.enum(['preparation', 'inWar', 'warEnded']),
  teamSize: z.number().int().min(1).max(100),
  attacksPerMember: z.number().int().min(1).max(4).default(2),
  battleModifier: z.enum(['none', 'hardMode']).catch('none').default('none'),
  preparationStartTime: cocDate,
  startTime: cocDate,
  endTime: cocDate,
  clan: sideSchema,
  opponent: sideSchema,
});

export type CocWar = z.output<typeof cocWarSchema>;

/** Entry of `GET /clans/{tag}/warlog` (Clan War League entries have no opponent tag: skipped). */
const warLogSideSchema = z.object({
  tag: tag.optional(),
  name: z.string().optional(),
  attacks: count.optional(),
  stars: count,
  destructionPercentage: percentage,
  expEarned: count.optional(),
});

export const cocWarLogSchema = z.object({
  items: z
    .array(
      z.object({
        result: z.enum(['win', 'lose', 'tie']).nullable().optional(),
        endTime: cocDate,
        teamSize: count,
        clan: warLogSideSchema,
        opponent: warLogSideSchema,
      }),
    )
    .catch([]),
});

export type CocWarLogEntry = z.output<typeof cocWarLogSchema>['items'][number];

export const listWarsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  state: z.enum(['preparation', 'inWar', 'warEnded']).optional(),
});

export type ListWarsQuery = z.output<typeof listWarsQuerySchema>;
