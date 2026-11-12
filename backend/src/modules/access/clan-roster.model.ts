import { InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * Last member list read of a clan of the Crusade. Kept so that access to the site survives a
 * backend restart while the Clash of Clans API is unreachable.
 */
const clanRosterSchema = new Schema(
  {
    clanTag: { type: String, required: true, unique: true },
    memberTags: { type: [String], default: [] },
    syncedAt: { type: Date, required: true },
  },
  { collection: 'ClanRosters', versionKey: false },
);

export type ClanRoster = InferSchemaType<typeof clanRosterSchema>;

export const ClanRosterModel: Model<ClanRoster> =
  (models.ClanRoster as Model<ClanRoster>) ?? model('ClanRoster', clanRosterSchema);
