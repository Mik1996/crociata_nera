import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * One commendation awarded to one player for one period (a month, a Raid Weekend, a CWL season).
 * The unique index makes the award idempotent: processing a period twice adds nothing.
 */
const commendationAwardSchema = new Schema(
  {
    /** `war:<warKey>`, `month:2026-10`, `raid:2026-10-30T07:00:00.000Z`, `cwl:2026-10` or `donations:2026-10`. */
    periodKey: { type: String, required: true },
    playerTag: { type: String, required: true },
    playerName: { type: String, required: true },
    /** Unique id of the commendation (catalogue `COMMENDATION_IDS`, `SINGLE_COMMENDATIONS`). */
    commendationId: { type: String, required: true },
    type: { type: String, required: true },
    /** `bronze`, `silver` or `gold`; `null` for a one-off commendation. */
    tier: { type: String, default: null },
    awardedAt: { type: Date, required: true },
  },
  { collection: 'CommendationAwards', versionKey: false },
);
commendationAwardSchema.index({ periodKey: 1, playerTag: 1, commendationId: 1 }, { unique: true });
commendationAwardSchema.index({ playerTag: 1 });

/** A period whose commendations were awarded: it is never processed again. */
const commendationPeriodSchema = new Schema(
  {
    periodKey: { type: String, required: true, unique: true },
    awards: { type: Number, required: true },
    processedAt: { type: Date, required: true },
    /**
     * War periods only: the kinds the war was checked for (`WAR_COMMENDATION_TYPES` at that time).
     * Missing on the war periods closed when `chiefHunter` was the only one.
     */
    kinds: { type: [String], default: undefined },
  },
  { collection: 'CommendationPeriods', versionKey: false },
);

export type CommendationAward = InferSchemaType<typeof commendationAwardSchema>;

export const CommendationAwardModel: Model<CommendationAward> =
  (models.CommendationAward as Model<CommendationAward>) ??
  model<CommendationAward>('CommendationAward', commendationAwardSchema);

export const CommendationPeriodModel: Model<InferSchemaType<typeof commendationPeriodSchema>> =
  (models.CommendationPeriod as Model<InferSchemaType<typeof commendationPeriodSchema>>) ??
  model('CommendationPeriod', commendationPeriodSchema);
