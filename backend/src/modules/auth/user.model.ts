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
    // Ready for email verification, added later without a migration.
    emailVerified: { type: Boolean, default: false },
  },
  { collection: 'Users', timestamps: true, versionKey: false },
);

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
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}
