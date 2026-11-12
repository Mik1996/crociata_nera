import { Types } from 'mongoose';
import { UserRole } from '@/lib/auth/user-role';
import { CocApiError, fetchPlayer } from '@/lib/coc/coc-client';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { SessionModel } from '@/modules/auth/session.model';
import { publicUser } from '@/modules/access/clan-access.service';
import { MAX_LINKED_PLAYERS, PublicUser, UserDocument, UserModel } from '@/modules/auth/user.model';
import { DeleteUserInput, LinkUserPlayersInput, ListUsersQuery, UpdateUserInput } from './admin.schemas';

export interface AdminUser extends PublicUser {
  updatedAt: string;
}

export interface UserPage {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listUsers(query: ListUsersQuery): Promise<UserPage> {
  const filter = query.search
    ? {
        $or: ['email', 'username', 'playerTags', 'pendingPlayerTag'].map((field) => ({
          [field]: { $regex: escapeRegex(query.search!), $options: 'i' },
        })),
      }
    : {};
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    UserModel.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(users.map(toAdminUser)),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Changes the roles of a user. An administrator cannot remove
 * their own ADMIN role (no lock-out). When roles change, the user's sessions are revoked
 * so the new roles apply at the next sign-in instead of up to 15 minutes later.
 */
export async function updateUser(actorId: string, userId: string, input: UpdateUserInput): Promise<AdminUser> {
  const user = Types.ObjectId.isValid(userId) ? await UserModel.findById(userId) : null;
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);

  let rolesChanged = false;
  if (input.roles) {
    const roles = [...new Set([UserRole.USER, ...input.roles])];
    if (actorId === userId && !roles.includes(UserRole.ADMIN)) {
      throwException(409, MessageKey.CANNOT_REMOVE_OWN_ADMIN);
    }
    rolesChanged = roles.length !== user.roles.length || roles.some((role) => !user.roles.includes(role));
    user.set('roles', roles);
  }
  await user.save();

  if (rolesChanged && actorId !== userId) {
    await SessionModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'revoked' } });
  }
  return toAdminUser(user);
}

/**
 * Links one or more Clash of Clans accounts to a user on an administrator's word, without the
 * in-game token: the links count as verified. Each account must exist in the game and must not
 * be linked to another user; the user keeps at most {@link MAX_LINKED_PLAYERS} accounts.
 * Unverified copies of the same tags (old links) are removed.
 */
export async function linkUserPlayers(userId: string, input: LinkUserPlayersInput): Promise<AdminUser> {
  const user = Types.ObjectId.isValid(userId) ? await UserModel.findById(userId) : null;
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);

  const tags = input.playerTags;
  const taken = await UserModel.find({ _id: { $ne: user._id }, playerTags: { $in: tags } })
    .select('playerTags')
    .lean();
  const takenTags = tags.filter((tag) => taken.some((other) => other.playerTags.includes(tag)));
  if (takenTags.length) {
    throwException(
      409,
      takenTags.map((tag) => ({
        key: MessageKey.PLAYER_TAG_LINKED_TO_OTHER_USER,
        params: { tag },
        field: 'playerTags',
      })),
    );
  }
  const newTags = tags.filter((tag) => !user.playerTags.includes(tag));
  if (user.playerTags.length + newTags.length > MAX_LINKED_PLAYERS) {
    throwException(409, [{ key: MessageKey.PLAYER_LIMIT_REACHED, params: { max: MAX_LINKED_PLAYERS } }]);
  }

  // The accounts must exist: catches typos in the tags.
  const missing: string[] = [];
  for (const tag of newTags) {
    try {
      await fetchPlayer(tag);
    } catch (error) {
      if (!(error instanceof CocApiError)) throw error;
      if (error.status !== 404) throwException(502, MessageKey.PLAYER_VERIFICATION_UNAVAILABLE);
      missing.push(tag);
    }
  }
  if (missing.length) {
    throwException(
      404,
      missing.map((tag) => ({
        key: MessageKey.PLAYER_NOT_FOUND_TAG,
        params: { tag },
        field: 'playerTags',
      })),
    );
  }

  await UserModel.updateMany({ pendingPlayerTag: { $in: tags } }, { $set: { pendingPlayerTag: null } });
  try {
    await UserModel.updateOne({ _id: user._id }, { $addToSet: { playerTags: { $each: tags } } });
  } catch (error) {
    // Another user verified one of the accounts in the meantime (unique index).
    if ((error as { code?: number }).code === 11000) {
      throwException(409, [{ key: MessageKey.PLAYER_TAG_ALREADY_LINKED, field: 'playerTags' }]);
    }
    throw error;
  }
  return toAdminUser((await UserModel.findById(user._id))!);
}

/**
 * Deletes a user and signs out all their sessions. The username must be typed again, exactly,
 * to confirm; administrators cannot delete their own account. Returns the deleted username.
 */
export async function deleteUser(actorId: string, userId: string, input: DeleteUserInput): Promise<string> {
  const user = Types.ObjectId.isValid(userId) ? await UserModel.findById(userId) : null;
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);
  if (actorId === userId) throwException(409, MessageKey.CANNOT_DELETE_OWN_ACCOUNT);
  if (input.username !== user.username) {
    throwException(400, [{ key: MessageKey.USERNAME_CONFIRMATION_MISMATCH, field: 'username' }]);
  }
  await SessionModel.deleteMany({ userId: user._id });
  await UserModel.deleteOne({ _id: user._id });
  return user.username;
}

/** Unlinks one Clash of Clans account of a user. */
export async function unlinkUserPlayer(userId: string, tag: string): Promise<AdminUser> {
  if (!Types.ObjectId.isValid(userId)) throwException(404, MessageKey.USER_NOT_FOUND);
  const user = await UserModel.findOneAndUpdate({ _id: userId }, { $pull: { playerTags: tag } }, { new: true });
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);
  if (user.pendingPlayerTag === tag) {
    user.pendingPlayerTag = null;
    await user.save();
  }
  return toAdminUser(user);
}

async function toAdminUser(user: UserDocument): Promise<AdminUser> {
  return { ...(await publicUser(user)), updatedAt: user.updatedAt.toISOString() };
}
