import { Types } from 'mongoose';
import { UserRole } from '@/lib/auth/user-role';
import { fetchClan } from '@/lib/coc/coc-client';
import { env } from '@/lib/config/env';
import { PublicUser, toPublicUser, UserDocument, UserModel } from '@/modules/auth/user.model';
import { ClanRosterModel } from './clan-roster.model';

/**
 * Clans of the Crusade: Crociata Nera, Crociata Rossa and Crociata d'Oro. Their members (with a
 * verified linked account) see the whole site; everybody else only the public pages.
 */
export const CRUSADE_CLAN_TAGS: readonly string[] = ['#2J8JVVCLC', '#2JU8RPR2G', '#2RRYUGQYJ'];

/** How long a member list read from the Clash of Clans API is trusted. */
export const ROSTER_TTL_MS = 5 * 60_000;
/** After a failed read, the next attempt waits at least this long (stale lists are used meanwhile). */
const RETRY_AFTER_FAILURE_MS = 60_000;

interface MemberCache {
  tags: Set<string>;
  expiresAt: number;
}

let cache: MemberCache | null = null;
let loading: Promise<Set<string>> | null = null;

/** The clans of the Crusade, including the configured `CLAN_TAG`. */
export function crusadeClanTags(): string[] {
  const configured = env().CLAN_TAG;
  return [...new Set([...CRUSADE_CLAN_TAGS, ...(configured ? [configured] : [])])];
}

/**
 * Tags (upper case) of the current members of the clans of the Crusade. Each clan's list is read
 * from the Clash of Clans API at most every {@link ROSTER_TTL_MS} and saved: when the API cannot be
 * reached, the last saved list is used, so members are not locked out by an outage.
 */
export function crusadeMemberTags(): Promise<Set<string>> {
  if (cache && Date.now() < cache.expiresAt) return Promise.resolve(cache.tags);
  loading ??= loadMemberTags().finally(() => (loading = null));
  return loading;
}

/** Signed-in user with full access: administrator, or owner of a verified account in a clan of the Crusade. */
export async function hasClanAccess(user: { roles: readonly string[]; playerTags: readonly string[] }): Promise<boolean> {
  if (user.roles.includes(UserRole.ADMIN)) return true;
  if (!user.playerTags.length) return false;
  const members = await crusadeMemberTags();
  return user.playerTags.some((tag) => members.has(tag.toUpperCase()));
}

/** {@link hasClanAccess} for a user id (from the access token); unknown users have no access. */
export async function userHasClanAccess(userId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId)) return false;
  const user = await UserModel.findById(userId).select('roles playerTags').lean();
  return !!user && hasClanAccess(user);
}

/** Public shape of a user, with {@link PublicUser.clanAccess} worked out. */
export async function publicUser(user: UserDocument): Promise<PublicUser> {
  return toPublicUser(user, await hasClanAccess(user));
}

/** Forgets the member lists kept in memory (tests). */
export function resetClanAccessCache(): void {
  cache = null;
  loading = null;
}

async function loadMemberTags(): Promise<Set<string>> {
  const clanTags = crusadeClanTags();
  const saved = new Map(
    (await ClanRosterModel.find({ clanTag: { $in: clanTags } }).lean()).map((roster) => [roster.clanTag, roster]),
  );
  let failed = false;
  const lists = await Promise.all(
    clanTags.map(async (clanTag) => {
      const roster = saved.get(clanTag);
      if (roster && Date.now() - roster.syncedAt.getTime() < ROSTER_TTL_MS) return roster.memberTags;
      try {
        const memberTags = parseMemberTags(await fetchClan(clanTag));
        await ClanRosterModel.updateOne(
          { clanTag },
          { $set: { memberTags, syncedAt: new Date() } },
          { upsert: true },
        );
        return memberTags;
      } catch (error) {
        failed = true;
        console.warn(`[access] member list of ${clanTag} not refreshed: ${(error as Error).message}`);
        return roster?.memberTags ?? [];
      }
    }),
  );
  const tags = new Set(lists.flat().map((tag) => tag.toUpperCase()));
  cache = { tags, expiresAt: Date.now() + (failed ? RETRY_AFTER_FAILURE_MS : ROSTER_TTL_MS) };
  return tags;
}

/** `memberList[].tag` of a `GET /clans/{tag}` response. */
function parseMemberTags(clan: unknown): string[] {
  const memberList = (clan as { memberList?: unknown } | null)?.memberList;
  if (!Array.isArray(memberList)) throw new Error('unexpected clan response: no memberList');
  return memberList
    .map((member) => (member as { tag?: unknown } | null)?.tag)
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.toUpperCase());
}
