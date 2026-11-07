import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

const roundSchema = new Schema({ warTags: { type: [String], default: [] } }, { _id: false });

/** A war of the group, kept as returned by `GET /clanwarleagues/wars/{warTag}`. */
const leagueWarSchema = new Schema(
  {
    warTag: { type: String, required: true },
    /** `preparation`, `inWar` or `warEnded`: ended wars are not read again. */
    state: { type: String, required: true },
    war: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

/**
 * One Clan War League season of the clan: the group (8 clans, 7 rounds) and every war of the
 * group, so standings and player statistics stay available after the API forgets the season.
 */
const cwlSeasonSchema = new Schema(
  {
    /** Season, `YYYY-MM`. */
    season: { type: String, required: true, unique: true },
    clanTag: { type: String, required: true },
    /** `preparation`, `inWar` or `ended`. */
    state: { type: String, required: true },
    /** Clans of the group as returned by the API (tag, name, level, badge, members). */
    clans: { type: [Schema.Types.Mixed], default: [] },
    rounds: { type: [roundSchema], default: [] },
    wars: { type: [leagueWarSchema], default: [] },
    lastSyncedAt: { type: Date, required: true },
  },
  { collection: 'CwlSeasons', timestamps: true, versionKey: false },
);

export type CwlSeason = InferSchemaType<typeof cwlSeasonSchema>;
export type CwlSeasonDocument = HydratedDocument<CwlSeason>;

export const CwlSeasonModel: Model<CwlSeason> =
  (models.CwlSeason as Model<CwlSeason>) ?? model<CwlSeason>('CwlSeason', cwlSeasonSchema);
