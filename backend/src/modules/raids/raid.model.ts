import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * A Raid Weekend of the clan, as returned by `GET /clans/{tag}/capitalraidseasons`.
 * The API lists the members only while the weekend is in progress: the last read before the
 * end is kept, so past weekends still show who attacked and how much Capital Gold they looted.
 */
const raidSeasonSchema = new Schema(
  {
    clanTag: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    /** `ongoing` or `ended`. */
    state: { type: String, required: true },
    /** The API item (totals, attack and defense logs, members when known). */
    season: { type: Schema.Types.Mixed, required: true },
    /** `true` once the member list was read at least once. */
    hasMembers: { type: Boolean, default: false },
    lastSyncedAt: { type: Date, required: true },
  },
  { collection: 'RaidSeasons', timestamps: true, versionKey: false },
);
raidSeasonSchema.index({ clanTag: 1, startTime: 1 }, { unique: true });

export type RaidSeasonRecord = InferSchemaType<typeof raidSeasonSchema>;
export type RaidSeasonDocument = HydratedDocument<RaidSeasonRecord>;

export const RaidSeasonModel: Model<RaidSeasonRecord> =
  (models.RaidSeason as Model<RaidSeasonRecord>) ?? model<RaidSeasonRecord>('RaidSeason', raidSeasonSchema);
