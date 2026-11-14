import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * A game season (the Gold Pass season of `GET /goldpass/seasons/current`): donations are
 * totalled over it, and its `donor` commendations are awarded once it has ended.
 */
const donationSeasonSchema = new Schema(
  {
    /** `YYYY-MM`: month of the middle of the season. */
    season: { type: String, required: true, unique: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
  },
  { collection: 'DonationSeasons', versionKey: false },
);
donationSeasonSchema.index({ startTime: 1, endTime: 1 });

/**
 * Troops donated by a player during a season, as counted by the backend. The game counter
 * restarts from zero when a player leaves the clan; this total does not: it adds up what the
 * counter grew between two reads (see `recordDonations`).
 */
const donationTotalSchema = new Schema(
  {
    season: { type: String, required: true },
    playerTag: { type: String, required: true },
    playerName: { type: String, required: true },
    /** Clan of the Crusade of the last donation counted; `null` for totals saved before it was tracked. */
    clanTag: { type: String, default: null },
    donations: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'DonationTotals', versionKey: false },
);
donationTotalSchema.index({ season: 1, playerTag: 1 }, { unique: true });

/**
 * Last value read of a player's in-game donation counter (`memberList[].donations`), across
 * seasons. Set to 0 when the player is no longer in the clan: the game resets the counter.
 */
const donationCounterSchema = new Schema(
  {
    playerTag: { type: String, required: true, unique: true },
    counter: { type: Number, required: true },
    readAt: { type: Date, required: true },
  },
  { collection: 'DonationCounters', versionKey: false },
);

export type DonationSeason = InferSchemaType<typeof donationSeasonSchema>;
export type DonationTotal = InferSchemaType<typeof donationTotalSchema>;
export type DonationCounter = InferSchemaType<typeof donationCounterSchema>;

export const DonationSeasonModel: Model<DonationSeason> =
  (models.DonationSeason as Model<DonationSeason>) ?? model<DonationSeason>('DonationSeason', donationSeasonSchema);

export const DonationTotalModel: Model<DonationTotal> =
  (models.DonationTotal as Model<DonationTotal>) ?? model<DonationTotal>('DonationTotal', donationTotalSchema);

export const DonationCounterModel: Model<DonationCounter> =
  (models.DonationCounter as Model<DonationCounter>) ?? model<DonationCounter>('DonationCounter', donationCounterSchema);
