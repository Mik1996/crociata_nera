import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

const attackSchema = new Schema(
  {
    attackerTag: { type: String, required: true },
    defenderTag: { type: String, required: true },
    stars: { type: Number, required: true },
    destructionPercentage: { type: Number, required: true },
    order: { type: Number, required: true },
    duration: { type: Number, default: null },
  },
  { _id: false },
);

const memberSchema = new Schema(
  {
    tag: { type: String, required: true },
    name: { type: String, required: true },
    townhallLevel: { type: Number, required: true },
    mapPosition: { type: Number, required: true },
    attacks: { type: [attackSchema], default: [] },
    opponentAttacks: { type: Number, default: 0 },
    bestOpponentAttack: { type: attackSchema, default: null },
  },
  { _id: false },
);

const sideSchema = new Schema(
  {
    tag: { type: String, required: true },
    name: { type: String, required: true },
    clanLevel: { type: Number, required: true },
    badgeUrl: { type: String, default: null },
    attacks: { type: Number, default: 0 },
    stars: { type: Number, required: true },
    destructionPercentage: { type: Number, required: true },
    /** Clan XP earned (from the war log, once the war has ended). */
    expEarned: { type: Number, default: null },
    members: { type: [memberSchema], default: [] },
  },
  { _id: false },
);

/** Order of war states: a sync never moves a war back to an earlier state. */
export const WAR_STATE_RANK = { preparation: 0, inWar: 1, warEnded: 2 } as const;
export type WarState = keyof typeof WAR_STATE_RANK;

/**
 * How the final state of an ended war was obtained:
 * - `currentWar`: read from `currentwar` while it showed `warEnded` (complete data);
 * - `lastSnapshot`: the `warEnded` state was never seen (a new war started first), so the
 *   last battle-day snapshot was closed, then corrected with the war log when available.
 */
export const FINALIZED_FROM = ['currentWar', 'lastSnapshot'] as const;

const warSchema = new Schema(
  {
    /** `YYYYMMDDTHHMMSS-OPPONENTTAG`, same id as the proxy archive and the frontend. */
    warKey: { type: String, required: true, unique: true },
    clanTag: { type: String, required: true },
    state: { type: String, enum: Object.keys(WAR_STATE_RANK), required: true },
    stateRank: { type: Number, required: true },
    teamSize: { type: Number, required: true },
    attacksPerMember: { type: Number, required: true },
    battleModifier: { type: String, default: 'none' },
    preparationStartTime: { type: Date, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    /** Set when the war has ended. */
    result: { type: String, enum: ['win', 'lose', 'tie', null], default: null },
    clan: { type: sideSchema, required: true },
    opponent: { type: sideSchema, required: true },
    finalizedFrom: { type: String, enum: [...FINALIZED_FROM, null], default: null },
    endedAt: { type: Date, default: null },
    /** `true` once final stars, destruction, result and XP were checked against the war log. */
    warLogMatched: { type: Boolean, default: false },
    /** `true` once the war, won with every star, was added to the perfect wars record. */
    perfectCounted: { type: Boolean, default: false },
    /** Last time the war was read from the Clash of Clans API. */
    lastSyncedAt: { type: Date, required: true },
  },
  { collection: 'Wars', timestamps: true, versionKey: false },
);

warSchema.index({ clanTag: 1, preparationStartTime: -1 });
warSchema.index({ state: 1, endTime: 1 });

export type War = InferSchemaType<typeof warSchema>;
export type WarDocument = HydratedDocument<War>;

export const WarModel: Model<War> = (models.War as Model<War>) ?? model('War', warSchema);
