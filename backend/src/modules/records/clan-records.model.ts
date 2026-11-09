import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/** A best value and when it was reached (`null`: before the backend tracked it). */
const recordSchema = new Schema(
  {
    value: { type: Number, required: true },
    achievedAt: { type: Date, default: null },
  },
  { _id: false },
);

/** Highest Clan War League reached (league ids grow with the rank). */
const leagueRecordSchema = new Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    achievedAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * All-time records of the clan, one document per clan. Seeded with the records known before the
 * backend tracked them (`INITIAL_CLAN_RECORDS`), then improved by the sync whenever the Clash of
 * Clans API shows a better value; a record never gets worse.
 */
const clanRecordsSchema = new Schema(
  {
    clanTag: { type: String, required: true, unique: true },
    /**
     * Wars won with every star (stars = team size × 3). The API does not count them: the sync adds
     * one for every ended war that ended after `perfectWarsSince` (wars before are in the seed).
     */
    perfectWars: { type: recordSchema, required: true },
    perfectWarsSince: { type: Date, required: true },
    /** Longest series of consecutive war wins (`warWinStreak`). */
    warWinStreak: { type: recordSchema, required: true },
    cwlLeague: { type: leagueRecordSchema, required: true },
    /** Best position in the clan rankings of the clan's country (1 = first). */
    localRank: { type: recordSchema, required: true },
    /** Best position in the Clan Capital rankings of the clan's country. */
    localCapitalRank: { type: recordSchema, required: true },
    /** Most Clan Capital trophies (`clanCapitalPoints`). */
    capitalPoints: { type: recordSchema, required: true },
  },
  { collection: 'ClanRecords', timestamps: true, versionKey: false },
);

export type ClanRecords = InferSchemaType<typeof clanRecordsSchema>;

export const ClanRecordsModel: Model<ClanRecords> =
  (models.ClanRecords as Model<ClanRecords>) ?? model<ClanRecords>('ClanRecords', clanRecordsSchema);
