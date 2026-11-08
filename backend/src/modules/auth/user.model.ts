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
    /** Linked Clash of Clans account (optional, e.g. `#ABC123`). */
    playerTag: { type: String, default: null },
    /**
     * The link was proven with the player's in-game API token (`verifytoken` endpoint). Links
     * made before the check existed stay, unverified, until the user verifies them.
     */
    playerTagVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    // One-time tokens sent by email: only their SHA-256 is stored, with an expiry.
    verifyEmailTokenHash: { type: String, default: null, select: false },
    verifyEmailExpiresAt: { type: Date, default: null, select: false },
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpiresAt: { type: Date, default: null, select: false },
  },
  { collection: 'Users', timestamps: true, versionKey: false },
);

// A Clash of Clans account can be verified by one user only.
userSchema.index({ playerTag: 1 }, { unique: true, partialFilterExpression: { playerTagVerified: true } });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel: Model<User> = (models.User as Model<User>) ?? model('User', userSchema);

/** Public shape of a user: never includes the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  username: string;
  roles: UserRole[];
  playerTag: string | null;
  /** `playerTag` proven with the in-game API token. */
  playerTagVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    roles: [...user.roles] as UserRole[],
    playerTag: user.playerTag ?? null,
    playerTagVerified: Boolean(user.playerTag && user.playerTagVerified),
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}
