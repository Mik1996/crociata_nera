import { z } from 'zod';
import { CocApiError, fetchPlayer } from '@/lib/coc/coc-client';
import { PlayerModel } from './player.model';

/** A profile is read again after this long. */
export const PROFILE_TTL_MS = 6 * 3_600_000;
/** Most profiles read per run, so a run never floods the Clash of Clans API. */
export const PROFILES_PER_RUN = 15;

const levelSchema = z.object({ name: z.string(), level: z.number(), maxLevel: z.number() }).passthrough();
const profileSchema = z
  .object({
    heroes: z
      .array(levelSchema.extend({ village: z.string().optional(), equipment: z.array(levelSchema).optional() }))
      .default([]),
  })
  .passthrough();

export interface ProfileSyncResult {
  refreshed: number;
  failed: number;
}

/**
 * Reads the profile (`GET /players/{tag}`) of the current members never read or read more than
 * {@link PROFILE_TTL_MS} ago, at most {@link PROFILES_PER_RUN}, oldest first, and saves their home
 * village heroes and the equipment the heroes wear (CWL line-up). A failure skips that player only.
 */
export async function syncPlayerProfiles(now = new Date()): Promise<ProfileSyncResult> {
  const due = await PlayerModel.find({
    inClan: true,
    $or: [{ profileSyncedAt: null }, { profileSyncedAt: { $lt: new Date(now.getTime() - PROFILE_TTL_MS) } }],
  })
    .sort({ profileSyncedAt: 1 })
    .limit(PROFILES_PER_RUN)
    .select('tag')
    .lean();
  const result: ProfileSyncResult = { refreshed: 0, failed: 0 };
  for (const { tag } of due) {
    try {
      const { heroes } = profileSchema.parse(await fetchPlayer(tag));
      const home = heroes.filter((h) => !h.village || h.village === 'home');
      const level = (l: z.infer<typeof levelSchema>) => ({ name: l.name, level: l.level, maxLevel: l.maxLevel });
      await PlayerModel.updateOne(
        { tag },
        {
          $set: {
            heroes: home.map(level),
            equipment: home.flatMap((h) => (h.equipment ?? []).map(level)),
            profileSyncedAt: now,
          },
        },
      );
      result.refreshed++;
    } catch (error) {
      if (!(error instanceof CocApiError) && !(error instanceof z.ZodError)) throw error;
      result.failed++;
      console.warn(`[profiles] ${tag} not read: ${error.message}`);
    }
  }
  return result;
}
