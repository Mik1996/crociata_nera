import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * A player excluded from the CWL line-up by an administrator (announced absence, choice of the
 * leaders…). The player stays in the ranking, marked as excluded, and takes no slot.
 */
const cwlExclusionSchema = new Schema(
  {
    playerTag: { type: String, required: true, unique: true },
    reason: { type: String, default: null },
    /** Username of the administrator. */
    excludedBy: { type: String, required: true },
    excludedAt: { type: Date, required: true },
  },
  { collection: 'CwlExclusions', versionKey: false },
);

export type CwlExclusion = InferSchemaType<typeof cwlExclusionSchema>;

export const CwlExclusionModel: Model<CwlExclusion> =
  (models.CwlExclusion as Model<CwlExclusion>) ?? model<CwlExclusion>('CwlExclusion', cwlExclusionSchema);
