import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * A player excluded from the CWL line-up by an administrator (announced absence, choice of the
 * leaders…). The player stays in the ranking, marked as excluded, and takes no slot. An exclusion
 * is for the selection of one season (`season`), or until an administrator takes the player back
 * (`season: null`, also the exclusions saved before selections had seasons).
 */
const cwlExclusionSchema = new Schema(
  {
    playerTag: { type: String, required: true },
    /** Season of the selection (`YYYY-MM`); `null`: every season, until revoked. */
    season: { type: String, default: null },
    reason: { type: String, default: null },
    /** Username of the administrator. */
    excludedBy: { type: String, required: true },
    excludedAt: { type: Date, required: true },
  },
  { collection: 'CwlExclusions', versionKey: false },
);
cwlExclusionSchema.index({ playerTag: 1, season: 1 }, { unique: true });

export type CwlExclusion = InferSchemaType<typeof cwlExclusionSchema>;

export const CwlExclusionModel: Model<CwlExclusion> =
  (models.CwlExclusion as Model<CwlExclusion>) ?? model<CwlExclusion>('CwlExclusion', cwlExclusionSchema);

/**
 * One-time migration: exclusions were unique by player while they had no season; now by player and
 * season. Drops the old index (no-op once done); the old exclusions, without `season`, last until revoked.
 */
export async function migrateCwlExclusionIndex(): Promise<void> {
  try {
    await CwlExclusionModel.collection.dropIndex('playerTag_1');
  } catch {
    // Already dropped (or never created).
  }
  await CwlExclusionModel.syncIndexes();
}
