import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/** `open`: the ranking is live and administrators exclude players; `closed`: frozen in `ranking`. */
export const SelectionState = { OPEN: 'open', CLOSED: 'closed' } as const;
export type SelectionState = (typeof SelectionState)[keyof typeof SelectionState];

/**
 * The selections of the Clan War League line-up, one per season (`YYYY-MM`, the CWL they are for).
 * The open one follows the live ranking; closing it (an administrator, or the scheduler when the
 * group of its season appears) freezes the ranking of that moment and opens the next season.
 */
const cwlSelectionSchema = new Schema(
  {
    season: { type: String, required: true, unique: true },
    state: { type: String, enum: Object.values(SelectionState), required: true, default: SelectionState.OPEN },
    closedAt: { type: Date, default: null },
    /** Username of the administrator who closed it; `null` while open or when closed by the scheduler. */
    closedBy: { type: String, default: null },
    /** Closed by the scheduler, when the CWL of the season started. */
    closedAutomatically: { type: Boolean, default: false },
    /** Starters of the line-up, 15 or 30 (`LINEUP_SIZES`: 3 or 5 reserves); missing in older documents: 15. */
    lineupSize: { type: Number, enum: [15, 30], default: 15 },
    /** The ranking at the closing (`CwlRanking`); `null` while open. */
    ranking: { type: Schema.Types.Mixed, default: null },
  },
  { collection: 'CwlSelections', timestamps: true, versionKey: false },
);

export type CwlSelectionDoc = InferSchemaType<typeof cwlSelectionSchema>;

export const CwlSelectionModel: Model<CwlSelectionDoc> =
  (models.CwlSelection as Model<CwlSelectionDoc>) ?? model<CwlSelectionDoc>('CwlSelection', cwlSelectionSchema);
