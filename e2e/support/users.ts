import { randomBytes, randomInt } from 'node:crypto';
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { ApiClient, type PublicUser } from './api';
import {
  FRONTEND_URL,
  SHARED_ADMIN,
  stack,
  TEST_EMAIL_DOMAIN,
  VALID_PLAYER_TOKEN,
  type AccountPool,
} from './stack';

/**
 * What a test user can reach:
 * - `none`: signed in, no game account linked (only the profile and public pages);
 * - `outside`: a verified game account that is not in a clan of the Crusade (same as `none`);
 * - `member`: elder/member of Crociata Nera (the clans' pages);
 * - `sister`: member of Crociata Rossa or Crociata d'Oro (the clans' pages too);
 * - `leader`: co-leader of a clan of the Crusade (also the CWL selections).
 */
export type Access = 'none' | 'outside' | 'member' | 'sister' | 'leader';

export interface UserOptions {
  access?: Access;
  /** Gives the ADMIN role (an address of ADMIN_EMAILS, confirmed). */
  admin?: boolean;
  /** Confirms the email address through the link received (always for administrators). */
  verified?: boolean;
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  /** Linked game account, if any, and its in-game name. */
  tag: string | null;
  playerName: string | null;
  /** Client signed in as this user (its own cookie jar and source address). */
  api: ApiClient;
}

/** A random private address: rate limits are per address, so tests never share a bucket. */
export function randomIp(): string {
  return `10.${randomInt(1, 250)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;
}

/** Unique username (3–24 characters: letters, digits, `.`, `-`, `_`). */
export function uniqueName(prefix = 'u'): string {
  return `${prefix}_${randomBytes(5).toString('hex')}`.slice(0, 24);
}

export const strongPassword = () => `Pw-${randomBytes(6).toString('hex')}1a`;

/** A new API client with its own cookie jar, calling from its own address. */
export async function newApiClient(
  contexts: APIRequestContext[],
  ip = randomIp(),
): Promise<ApiClient> {
  const context = await playwrightRequest.newContext({
    baseURL: FRONTEND_URL,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });
  contexts.push(context);
  return new ApiClient(context);
}

/** The administrator created by the stack, signed in (again after a 401). Never modified by tests. */
export class SharedAdmin {
  private client: ApiClient | null = null;
  private readonly contexts: APIRequestContext[] = [];

  async api(): Promise<ApiClient> {
    if (!this.client) {
      this.client = await newApiClient(this.contexts);
      const reply = await this.client.signIn(SHARED_ADMIN.username, SHARED_ADMIN.password);
      if (reply.status !== 200) throw new Error(`shared admin sign-in failed: ${reply.status}`);
    }
    const me = await this.client.get('/auth/me');
    if (me.status === 401) {
      this.client = null;
      return this.api();
    }
    return this.client;
  }

  async dispose(): Promise<void> {
    await Promise.all(this.contexts.map((c) => c.dispose()));
  }
}

/**
 * Creates the users of one test and cleans up after it: game accounts given back, base proposals
 * left pending withdrawn, administrators of the pool deleted and their address given back.
 */
export class UserFactory {
  private readonly users: TestUser[] = [];
  private readonly reserved: string[] = [];
  /** Users created with an address of the administrators' pool. */
  private readonly poolAdmins = new Set<TestUser>();
  /**
   * Confirmation links already in the mailbox of a user's address before their sign-up: an address
   * of the administrators' pool is used again after its previous user was deleted, and the links
   * sent to that user are dead.
   */
  private readonly earlierLinks = new WeakMap<TestUser, number>();
  private readonly contexts: APIRequestContext[] = [];

  constructor(private readonly admin: SharedAdmin) {}

  async create(options: UserOptions = {}): Promise<TestUser> {
    const access = options.access ?? 'none';
    const username = uniqueName(options.admin ? 'adm' : access);
    const email = options.admin
      ? (await stack.takeAccount('admin')).tag
      : `${username}@${TEST_EMAIL_DOMAIN}`;
    const password = strongPassword();
    const api = await newApiClient(this.contexts);
    const earlierLinks = await stack.linkCount(email, '/verify-email');

    const signUp = await api.post('/auth/sign-up', {
      email,
      username,
      password,
      repeatPassword: password,
      language: 'en-US',
    });
    if (signUp.status !== 201)
      throw new Error(`sign-up of ${username}: ${signUp.status} ${JSON.stringify(signUp.body)}`);
    api.accessToken = signUp.body.result.accessToken;
    const user: TestUser = {
      id: signUp.body.result.user.id,
      email,
      username,
      password,
      tag: null,
      playerName: null,
      api,
    };
    this.users.push(user);
    this.earlierLinks.set(user, earlierLinks);
    if (options.admin) this.poolAdmins.add(user);

    if (options.verified || options.admin) {
      await this.confirmEmail(user);
      // A new session carries the ADMIN role in its token (granted when the address is confirmed).
      if (options.admin) await api.signIn(username, password);
    }
    if (access !== 'none') await this.link(user, access === 'outside' ? 'outside' : access);
    return user;
  }

  /** Confirms the address with the link of the confirmation email (as the user would). */
  async confirmEmail(user: TestUser): Promise<PublicUser> {
    const link = await stack.waitForLink(
      user.email,
      '/verify-email',
      this.earlierLinks.get(user) ?? 0,
    );
    const reply = await user.api.post('/auth/verify-email', {
      token: new URL(link).searchParams.get('token'),
    });
    if (reply.status !== 200)
      throw new Error(`email confirmation of ${user.username}: ${reply.status}`);
    return reply.body.result;
  }

  /** Links a free game account of `pool` with its in-game token (real verification flow). */
  async link(user: TestUser, pool: AccountPool): Promise<void> {
    const account = await stack.takeAccount(pool);
    user.tag = account.tag;
    user.playerName = account.name;
    const reply = await user.api.post('/auth/me/player', {
      playerTag: account.tag,
      token: VALID_PLAYER_TOKEN,
    });
    if (reply.status !== 200)
      throw new Error(
        `linking ${account.tag} to ${user.username}: ${reply.status} ${JSON.stringify(reply.body)}`,
      );
  }

  /** A game account of `pool` reserved for the test without linking it (linked by the test itself). */
  async reserveAccount(pool: AccountPool): Promise<{ tag: string; name: string | null }> {
    const account = await stack.takeAccount(pool);
    this.reserved.push(account.tag);
    return account;
  }

  /**
   * Leaves the shared state as the test found it, whatever happened in the test and whatever the
   * state of the users' sessions:
   * 1. every base the test's users created — pending, rejected or published — is deleted with its
   *    picture (the arsenal and the moderation queue are shared by all tests);
   * 2. every game account the test used is unlinked from whoever holds it (including users the
   *    test created through the UI) and given back to its pool;
   * 3. administrators made from the pool are deleted, and their address goes back to the pool (a
   *    confirmed address keeps its user, so it could not serve another test otherwise).
   * Every step is checked: a failed clean-up fails the test instead of leaking into the next ones.
   */
  async cleanup(): Promise<void> {
    try {
      const needsAdmin = this.users.length > 0 || this.reserved.length > 0;
      const admin = needsAdmin ? await this.admin.api() : null;

      for (const user of this.users) {
        const bases = await stack.find<{ _id: string }>(
          'DefenseBases',
          { createdBy: user.id },
          { _id: 1 },
        );
        for (const base of bases) {
          const removed = await admin!.delete(`/bases/${base._id}`);
          // 404: the test removed it itself meanwhile.
          if (removed.status !== 200 && removed.status !== 404)
            throw new Error(`deleting base ${base._id}: ${removed.status}`);
        }
      }

      const tags = new Set([
        ...this.users.flatMap((u) => (u.tag ? [u.tag] : [])),
        ...this.reserved,
      ]);
      for (const tag of tags) {
        for (const owner of await stack.find<{ _id: string }>(
          'Users',
          { playerTags: tag },
          { _id: 1 },
        )) {
          const unlinked = await admin!.delete(
            `/admin/users/${owner._id}/players/${encodeURIComponent(tag)}`,
          );
          if (unlinked.status !== 200) throw new Error(`unlinking ${tag}: ${unlinked.status}`);
        }
        await stack.releaseAccount(tag);
      }

      for (const user of this.poolAdmins) {
        const removed = await admin!.delete(`/admin/users/${user.id}`, { username: user.username });
        // 404: the test deleted the user itself.
        if (removed.status !== 200 && removed.status !== 404)
          throw new Error(`deleting administrator ${user.username}: ${removed.status}`);
        await stack.releaseAccount(user.email);
      }
    } finally {
      await Promise.all(this.contexts.map((c) => c.dispose()));
    }
  }
}
