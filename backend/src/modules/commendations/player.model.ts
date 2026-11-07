import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * A commendation earned by the player, with how many times. The frontend translates it from
 * `type` and `tier`.
 */
const earnedSchema = new Schema(
  {
    /** Unique id of the commendation (catalogue `COMMENDATION_IDS`). */
    id: { type: String, required: true },
    /** `<type>-<tier>`, e.g. `champion-gold` (also the name of the medal image). */
    name: { type: String, required: true },
    type: { type: String, required: true },
    tier: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * A player of the clan (current or former) with the data read from Clash of Clans and the
 * commendations earned. The commendations come from {@link CommendationAwardModel}: they are
 * frozen when awarded, so later changes to the rules do not alter them.
 */
const playerSchema = new Schema(
  {
    tag: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, default: null },
    townHallLevel: { type: Number, default: null },
    expLevel: { type: Number, default: null },
    trophies: { type: Number, default: null },
    league: {
      type: new Schema({ id: Number, name: String, iconUrl: String }, { _id: false }),
      default: null,
    },
    /** `false` once the player has left the clan. */
    inClan: { type: Boolean, default: false },
    /** Last time the player was seen in the clan member list. */
    lastSeenAt: { type: Date, default: null },
    commendations: { type: [earnedSchema], default: [] },
  },
  { collection: 'Players', timestamps: true, versionKey: false },
);

export type Player = InferSchemaType<typeof playerSchema>;
export type PlayerDocument = HydratedDocument<Player>;

export const PlayerModel: Model<Player> = (models.Player as Model<Player>) ?? model<Player>('Player', playerSchema);
