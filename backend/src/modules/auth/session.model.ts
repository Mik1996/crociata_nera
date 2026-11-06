import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * One document per issued refresh token. Rotated on every refresh: the old session is
 * revoked and points to its successor, so reusing a stolen, already-rotated token can be
 * detected. MongoDB deletes expired sessions automatically (TTL index on `expiresAt`).
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** SHA-256 of the refresh token; the token itself is never stored. */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'Session', default: null },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { collection: 'Sessions', timestamps: true, versionKey: false },
);

export type Session = InferSchemaType<typeof sessionSchema>;
export type SessionDocument = HydratedDocument<Session>;

export const SessionModel: Model<Session> =
  (models.Session as Model<Session>) ?? model('Session', sessionSchema);
