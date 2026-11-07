import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { PlayerModel } from './player.model';

export interface PlayerRecord {
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  expLevel: number | null;
  trophies: number | null;
  league: { id: number; name: string; iconUrl?: string } | null;
  inClan: boolean;
  lastSeenAt: string | null;
  /** Commendations earned: catalogue id, `<type>-<tier>`, type, tier, how many times. */
  commendations: { id: string; name: string; type: string; tier: string; quantity: number }[];
}

/** A saved player (current or former member) with the commendations earned. */
export async function getPlayer(tag: string): Promise<PlayerRecord> {
  const doc = await PlayerModel.findOne({ tag: tag.toUpperCase() });
  if (!doc) throwException(404, MessageKey.PLAYER_NOT_FOUND);
  const p = doc.toObject();
  return {
    tag: p.tag,
    name: p.name,
    role: p.role ?? null,
    townHallLevel: p.townHallLevel ?? null,
    expLevel: p.expLevel ?? null,
    trophies: p.trophies ?? null,
    league: p.league ? { id: p.league.id!, name: p.league.name!, iconUrl: p.league.iconUrl ?? undefined } : null,
    inClan: p.inClan,
    lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
    commendations: p.commendations.map((c) => ({ id: c.id, name: c.name, type: c.type, tier: c.tier, quantity: c.quantity })),
  };
}
