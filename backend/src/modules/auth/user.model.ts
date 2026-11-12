import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';
import { UserRole } from '@/lib/auth/user-role';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    /** Lower-case copy of `username` for case-insensitive uniqueness. */
    usernameKey: { type: String, required: true, unique: true, select: false },
    passwordHash: { type: String, required: true, select: false },
    roles: { type: [String], enum: Object.values(UserRole), default: [UserRole.USER] },
    /**
     * Linked Clash of Clans accounts (e.g. `#ABC123`), each proven with the player's in-game API
     * token (`verifytoken` endpoint). A user can link several accounts.
     */
    playerTags: { type: [String], default: [] },
    /**
     * Account linked before the token check existed: kept, unverified, until the user verifies it
     * (it then moves to `playerTags`). Never set by new links.
     */
    pendingPlayerTag: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    // One-time tokens sent by email: only their SHA-256 is stored, with an expiry.
    verifyEmailTokenHash: { type: String, default: null, select: false },
    verifyEmailExpiresAt: { type: Date, default: null, select: false },
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpiresAt: { type: Date, default: null, select: false },
  },
  { collection: 'Users', timestamps: true, versionKey: false },
);

// A Clash of Clans account can be verified by one user only. Users without linked accounts
// (empty array) are left out of the index.
userSchema.index({ playerTags: 1 }, { unique: true, partialFilterExpression: { playerTags: { $type: 'string' } } });

/** Most Clash of Clans accounts a user can link. */
export const MAX_LINKED_PLAYERS = 10;

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel: Model<User> = (models.User as Model<User>) ?? model('User', userSchema);

export interface LinkedPlayer {
  tag: string;
  /** Proven with the in-game API token. */
  verified: boolean;
}

/** Public shape of a user: never includes the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  username: string;
  roles: UserRole[];
  /** Linked Clash of Clans accounts; `verified: false` only for links made before the token check. */
  players: LinkedPlayer[];
  emailVerified: boolean;
  /**
   * Full access to the site: administrator, or a verified account currently in a clan of the
   * Crusade (see `hasClanAccess`). Without it only the public pages are open.
   */
  clanAccess: boolean;
  createdAt: string;
}

export function toPublicUser(user: UserDocument, clanAccess: boolean): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    roles: [...user.roles] as UserRole[],
    players: [
      ...user.playerTags.map((tag) => ({ tag, verified: true })),
      ...(user.pendingPlayerTag ? [{ tag: user.pendingPlayerTag, verified: false }] : []),
    ],
    emailVerified: user.emailVerified,
    clanAccess,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * One-time migration from the single linked account (`playerTag` + `playerTagVerified`) to the
 * list of accounts: verified tags move to `playerTags`, unverified ones to `pendingPlayerTag`,
 * and the old unique index is dropped. No-op once done; safe to run on every start.
 */
export async function migrateLinkedPlayers(): Promise<void> {
  const users = UserModel.collection;
  const unsetOld = { $unset: ['playerTag', 'playerTagVerified'] };
  await users.updateMany({ playerTag: { $type: 'string' }, playerTagVerified: true }, [
    { $set: { playerTags: { $setUnion: [{ $ifNull: ['$playerTags', []] }, ['$playerTag']] } } },
    unsetOld,
  ]);
  await users.updateMany({ playerTag: { $type: 'string' } }, [{ $set: { pendingPlayerTag: '$playerTag' } }, unsetOld]);
  await users.updateMany({ $or: [{ playerTag: { $exists: true } }, { playerTagVerified: { $exists: true } }] }, [unsetOld]);
  try {
    await users.dropIndex('playerTag_1');
  } catch {
    // Already dropped (or never created).
  }
}
