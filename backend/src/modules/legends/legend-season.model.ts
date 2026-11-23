import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

const rankedSchema = new Schema(
  {
    tag: { type: String, required: true },
    rank: { type: Number, required: true },
    trophies: { type: Number, required: true },
  },
  { _id: false },
);

/** A member of the Crusade who ended the season among the first 10,000 of the world in Legend League I. */
const resultSchema = new Schema(
  {
    tag: { type: String, required: true },
    name: { type: String, required: true },
    /** Clan of the Crusade the player is in. */
    clanTag: { type: String, required: true },
    /** World position at the end of the season (1–10,000). */
    rank: { type: Number, required: true },
    trophies: { type: Number, required: true },
    /** Position in the country of the clan; `null` when unknown (no reading before the end, or beyond its top 200). */
    countryRank: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * A Legend League season (four weeks, ending on Monday at 05:00 UTC). A few minutes before its end the
 * country ranking is read (it is reset when the season ends); once the API lists the season as ended,
 * its final world ranking gives the results of the members, then the season is processed. The season
 * ended before the backend tracked them is saved as processed without results, read once afterwards
 * from its final ranking (`resultsReadLateAt`).
 */
const legendSeasonSchema = new Schema(
  {
    /** `v2-2026-10-26T05:00:00Z`, as the API names it (the end of the season). */
    seasonId: { type: String, required: true, unique: true },
    endTime: { type: Date, required: true },
    /** Country of the clan (`clan.location`) whose ranking was read. */
    countryCode: { type: String, default: null },
    locationId: { type: Number, default: null },
    /** The country's top 200 a few minutes before the end; `null` while not read. */
    countryRanking: { type: [rankedSchema], default: null },
    countryRankingAt: { type: Date, default: null },
    /** Members in Legend League I at that reading (only they can be celebrated). */
    legendOneTags: { type: [String], default: null },
    results: { type: [resultSchema], default: [] },
    processedAt: { type: Date, default: null },
    /**
     * When the results of a season processed without them (it ended before the backend tracked Legend
     * League) were read from its final ranking; `null` otherwise.
     */
    resultsReadLateAt: { type: Date, default: null },
  },
  { collection: 'LegendSeasons', versionKey: false },
);

export type LegendSeason = InferSchemaType<typeof legendSeasonSchema>;
export type LegendSeasonResult = InferSchemaType<typeof resultSchema>;

export const LegendSeasonModel: Model<LegendSeason> =
  (models.LegendSeason as Model<LegendSeason>) ?? model<LegendSeason>('LegendSeason', legendSeasonSchema);
