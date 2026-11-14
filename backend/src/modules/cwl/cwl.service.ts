import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { CwlSeasonModel } from './cwl.model';

export interface CwlSeasonSummary {
  season: string;
  state: string;
  lastSyncedAt: string;
}

/** Group and wars of a season, in the formats of the Clash of Clans API. */
export interface CwlSeasonDetail extends CwlSeasonSummary {
  clanTag: string;
  clans: unknown[];
  rounds: { warTags: string[] }[];
  /** `GET /clanwarleagues/wars/{warTag}` responses, each with its `warTag`. */
  wars: Record<string, unknown>[];
}

/** Filter on the main clan (`CLAN_TAG`): the pages show its seasons. */
const mainClan = () => (env().CLAN_TAG ? { clanTag: env().CLAN_TAG } : {});

/** Saved seasons of the main clan, most recent first. */
export async function listCwlSeasons(limit = 12): Promise<CwlSeasonSummary[]> {
  const seasons = await CwlSeasonModel.find(mainClan()).sort({ season: -1 }).limit(limit).select('season state lastSyncedAt');
  return seasons.map((s) => ({ season: s.season, state: s.state, lastSyncedAt: s.lastSyncedAt.toISOString() }));
}

export async function getCwlSeason(season: string): Promise<CwlSeasonDetail> {
  const doc = await CwlSeasonModel.findOne({ ...mainClan(), season });
  if (!doc) throwException(404, MessageKey.CWL_SEASON_NOT_FOUND);
  const plain = doc.toObject();
  return {
    season: plain.season,
    state: plain.state,
    lastSyncedAt: plain.lastSyncedAt.toISOString(),
    clanTag: plain.clanTag,
    clans: plain.clans,
    rounds: plain.rounds.map((r) => ({ warTags: r.warTags })),
    wars: plain.wars.map((w) => ({ ...(w.war as Record<string, unknown>), warTag: w.warTag })),
  };
}
