import { Types } from 'mongoose';
import { UserRole } from '@/lib/auth/user-role';
import { fetchClan } from '@/lib/coc/coc-client';
import { crusadeClanTags } from '@/lib/coc/crusade-clans';
import { PublicUser, toPublicUser, UserDocument, UserModel } from '@/modules/auth/user.model';
import { ClanRosterModel } from './clan-roster.model';

/**
 * Members of the clans of the Crusade (with a verified linked account) see the whole site;
 * everybody else only the public pages.
 */
export { CRUSADE_CLAN_TAGS, crusadeClanTags } from '@/lib/coc/crusade-clans';

/** How long a member list read from the Clash of Clans API is trusted. */
export const ROSTER_TTL_MS = 5 * 60_000;
/** After a failed read, the next attempt waits at least this long (stale lists are used meanwhile). */
const RETRY_AFTER_FAILURE_MS = 60_000;

interface Members {
  /** Every member of the clans of the Crusade (upper case). */
  tags: Set<string>;
  /** Leaders and co-leaders of the clans of the Crusade (upper case). */
  leaderTags: Set<string>;
}

interface MemberCache extends Members {
  expiresAt: number;
}

/** In-game roles that lead a clan: they reach the leaders' pages (CWL line-up). */
export const LEADER_ROLES: readonly string[] = ['leader', 'coLeader'];

let cache: MemberCache | null = null;
let loading: Promise<Members> | null = null;

/**
 * Tags (upper case) of the current members of the clans of the Crusade. Each clan's list is read
 * from the Clash of Clans API at most every {@link ROSTER_TTL_MS} and saved: when the API cannot be
 * reached, the last saved list is used, so members are not locked out by an outage.
 */
export async function crusadeMemberTags(): Promise<Set<string>> {
  return (await crusadeMembers()).tags;
}

/** Tags (upper case) of the leaders and co-leaders of the clans of the Crusade; same cache as {@link crusadeMemberTags}. */
export async function crusadeLeaderTags(): Promise<Set<string>> {
  return (await crusadeMembers()).leaderTags;
}

function crusadeMembers(): Promise<Members> {
  if (cache && Date.now() < cache.expiresAt) return Promise.resolve(cache);
  loading ??= loadMembers().finally(() => (loading = null));
  return loading;
}

/** Signed-in user with full access: administrator, or owner of a verified account in a clan of the Crusade. */
export async function hasClanAccess(user: { roles: readonly string[]; playerTags: readonly string[] }): Promise<boolean> {
  if (user.roles.includes(UserRole.ADMIN)) return true;
  if (!user.playerTags.length) return false;
  const members = await crusadeMemberTags();
  return user.playerTags.some((tag) => members.has(tag.toUpperCase()));
}

/**
 * Signed-in user who reaches the leaders' pages (CWL line-up): administrator, or owner of a verified
 * account that is leader or co-leader of a clan of the Crusade.
 */
export async function hasLeaderAccess(user: { roles: readonly string[]; playerTags: readonly string[] }): Promise<boolean> {
  if (user.roles.includes(UserRole.ADMIN)) return true;
  if (!user.playerTags.length) return false;
  const leaders = await crusadeLeaderTags();
  return user.playerTags.some((tag) => leaders.has(tag.toUpperCase()));
}

/** {@link hasClanAccess} for a user id (from the access token); unknown users have no access. */
export async function userHasClanAccess(userId: string): Promise<boolean> {
  const user = await findAccessUser(userId);
  return !!user && hasClanAccess(user);
}

/** {@link hasLeaderAccess} for a user id (from the access token); unknown users have no access. */
export async function userHasLeaderAccess(userId: string): Promise<boolean> {
  const user = await findAccessUser(userId);
  return !!user && hasLeaderAccess(user);
}

async function findAccessUser(userId: string) {
  if (!Types.ObjectId.isValid(userId)) return null;
  return UserModel.findById(userId).select('roles playerTags').lean();
}

/** Public shape of a user, with {@link PublicUser.clanAccess} and {@link PublicUser.leaderAccess} worked out. */
export async function publicUser(user: UserDocument): Promise<PublicUser> {
  const [clanAccess, leaderAccess] = await Promise.all([hasClanAccess(user), hasLeaderAccess(user)]);
  return toPublicUser(user, clanAccess, leaderAccess);
}

/** Forgets the member lists kept in memory (tests). */
export function resetClanAccessCache(): void {
  cache = null;
  loading = null;
}

async function loadMembers(): Promise<Members> {
  const clanTags = crusadeClanTags();
  const saved = new Map(
    (await ClanRosterModel.find({ clanTag: { $in: clanTags } }).lean()).map((roster) => [roster.clanTag, roster]),
  );
  let failed = false;
  const lists = await Promise.all(
    clanTags.map(async (clanTag) => {
      const roster = saved.get(clanTag);
      const savedLists = { memberTags: roster?.memberTags ?? [], leaderTags: roster?.leaderTags ?? [] };
      if (roster && Date.now() - roster.syncedAt.getTime() < ROSTER_TTL_MS) return savedLists;
      try {
        const lists = parseMembers(await fetchClan(clanTag));
        await ClanRosterModel.updateOne(
          { clanTag },
          { $set: { ...lists, syncedAt: new Date() } },
          { upsert: true },
        );
        return lists;
      } catch (error) {
        failed = true;
        console.warn(`[access] member list of ${clanTag} not refreshed: ${(error as Error).message}`);
        return savedLists;
      }
    }),
  );
  const upper = (tags: string[]) => new Set(tags.map((tag) => tag.toUpperCase()));
  const members: Members = {
    tags: upper(lists.flatMap((l) => l.memberTags)),
    leaderTags: upper(lists.flatMap((l) => l.leaderTags)),
  };
  cache = { ...members, expiresAt: Date.now() + (failed ? RETRY_AFTER_FAILURE_MS : ROSTER_TTL_MS) };
  return members;
}

/** Tags of `memberList[]` of a `GET /clans/{tag}` response, and those of its leaders and co-leaders. */
function parseMembers(clan: unknown): { memberTags: string[]; leaderTags: string[] } {
  const memberList = (clan as { memberList?: unknown } | null)?.memberList;
  if (!Array.isArray(memberList)) throw new Error('unexpected clan response: no memberList');
  const members = memberList
    .map((member) => member as { tag?: unknown; role?: unknown } | null)
    .filter((member): member is { tag: string; role?: unknown } => typeof member?.tag === 'string')
    .map((member) => ({ tag: member.tag.toUpperCase(), role: member.role }));
  return {
    memberTags: members.map((m) => m.tag),
    leaderTags: members.filter((m) => typeof m.role === 'string' && LEADER_ROLES.includes(m.role)).map((m) => m.tag),
  };
}
