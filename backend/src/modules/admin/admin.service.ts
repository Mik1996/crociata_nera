import { Types } from 'mongoose';
import { UserRole } from '@/lib/auth/user-role';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { SessionModel } from '@/modules/auth/session.model';
import { PublicUser, toPublicUser, UserModel } from '@/modules/auth/user.model';
import { ListUsersQuery, UpdateUserInput } from './admin.schemas';

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
        $or: ['email', 'username', 'playerTag'].map((field) => ({
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
    items: users.map((user) => ({ ...toPublicUser(user), updatedAt: user.updatedAt.toISOString() })),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Changes roles and/or unlinks the player tag of a user. An administrator cannot remove
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
  if (input.playerTag === null) user.set({ playerTag: null, playerTagVerified: false });
  await user.save();

  if (rolesChanged && actorId !== userId) {
    await SessionModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
  return { ...toPublicUser(user), updatedAt: user.updatedAt.toISOString() };
}
