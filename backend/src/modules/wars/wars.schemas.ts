import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';

/**
 * Payload of `POST /api/v1/wars`: the `currentwar` JSON of the Clash of Clans API,
 * as the frontend receives it. Unknown fields are dropped.
 */
const tag = z.string().regex(/^#[0-9A-Z]{3,15}$/i).transform((t) => t.toUpperCase());
const count = z.number().int().min(0);
const percentage = z.number().min(0).max(100);
/** API date format: `20261105T120000.000Z`. */
const cocDate = z
  .string()
  .regex(/^\d{8}T\d{6}(\.\d{3})?Z$/)
  .transform((value) => {
    const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(value)!;
    return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!));
  });

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
  badgeUrls: z.object({ small: z.url().optional(), medium: z.url().optional(), large: z.url().optional() }).optional(),
  attacks: count.default(0),
  stars: count,
  destructionPercentage: percentage,
  members: z.array(memberSchema).max(100).default([]),
});

export const saveWarSchema = z.object(
  {
    state: z.enum(['preparation', 'inWar', 'warEnded'], { error: MessageKey.WAR_IS_NOT_SAVABLE }),
    teamSize: z.number().int().min(1).max(100),
    attacksPerMember: z.number().int().min(1).max(4).default(2),
    battleModifier: z.enum(['none', 'hardMode']).default('none'),
    preparationStartTime: cocDate,
    startTime: cocDate,
    endTime: cocDate,
    clan: sideSchema,
    opponent: sideSchema,
  },
  { error: MessageKey.WAR_IS_NOT_SAVABLE },
);

export type SaveWarInput = z.output<typeof saveWarSchema>;

export const listWarsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  state: z.enum(['preparation', 'inWar', 'warEnded']).optional(),
});

export type ListWarsQuery = z.output<typeof listWarsQuerySchema>;
