import { Types } from 'mongoose';
import { escapeHtml } from '@/lib/telegram/telegram-client';
import { UserModel } from '@/modules/auth/user.model';
import { PlayerModel } from '@/modules/commendations/player.model';

/**
 * Text of the Telegram posts of the bases. The posts are read by the members in the clan's
 * channels, so (like the emails) they are written in Italian; troop names stay in English, as the
 * game's API gives them.
 */

/** Longest caption of a photo accepted by Telegram (characters after the HTML is read). */
export const TELEGRAM_CAPTION_LIMIT = 1024;

/** Label of the button that opens the base in the game. */
export const COPY_BASE_BUTTON = '📋 Copia la base';

const ELLIPSIS = '...';
/** Between two lines of the caption: an empty line, so each one stands apart. */
const LINE_BREAK = '\n\n';

export interface BasePostContent {
  townHallLevel: number;
  clanCastleTroops: readonly { name: string; count: number }[];
  description: string;
  authorName: string | null;
}

/** A line of the caption: its HTML and the text Telegram counts. */
interface Line {
  html: string;
  text: string;
}

/**
 * Caption (HTML) of the post of a base, ending with the hashtag of its town hall (`#TH17`). Lines
 * without content are left out. If the whole caption
 * is longer than Telegram accepts, the description is cut and ends with "...".
 */
export function basePostCaption({ townHallLevel, clanCastleTroops, description, authorName }: BasePostContent): string {
  const troops = clanCastleTroops.map(({ name, count }) => `${count}× ${name}`).join(', ');
  const head: Line[] = [plainLine('🏰 ', `Base TH${townHallLevel}`, true)];
  if (troops) head.push(plainLine('🛡️ Castello del clan: ', troops));
  const tail: Line[] = authorName ? [plainLine('👤 Proposta da ', authorName, true)] : [];
  // Hashtag of the town hall, to find its bases with the search of the channel.
  tail.push(plainLine('', `#TH${townHallLevel}`));

  const text = description.trim();
  if (text) {
    const prefix = '📝 ';
    const others = [...head, ...tail].reduce((sum, line) => sum + line.text.length + LINE_BREAK.length, 0);
    const room = TELEGRAM_CAPTION_LIMIT - others - prefix.length;
    const fitting = text.length <= room ? text : `${text.slice(0, Math.max(0, room - ELLIPSIS.length)).trimEnd()}${ELLIPSIS}`;
    head.push({ html: `${prefix}${escapeHtml(fitting)}`, text: `${prefix}${fitting}` });
  }
  return [...head, ...tail].map((line) => line.html).join(LINE_BREAK);
}

function plainLine(label: string, value: string, bold = false): Line {
  const html = bold ? `<b>${escapeHtml(value)}</b>` : escapeHtml(value);
  return { html: `${label}${html}`, text: `${label}${value}` };
}

/** In-game roles, from the highest. Players no longer in a clan of the Crusade come last. */
const ROLE_RANK: Record<string, number> = { leader: 4, coLeader: 3, admin: 2, member: 1 };

/**
 * In-game name shown as the author of a base: among the accounts linked to the user, the one with
 * the highest role in the clan, then the highest town hall. `null` when the user is gone or has no
 * known account.
 */
export async function authorNameOf(userId: Types.ObjectId | string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await UserModel.findById(userId).select('playerTags').lean();
  if (!user?.playerTags.length) return null;
  const players = await PlayerModel.find({ tag: { $in: user.playerTags.map((tag) => tag.toUpperCase()) } })
    .select('name role inClan townHallLevel')
    .lean();
  const rank = (player: (typeof players)[number]) => (player.inClan ? (ROLE_RANK[player.role ?? ''] ?? 0) : 0);
  const best = players.sort(
    (a, b) => rank(b) - rank(a) || (b.townHallLevel ?? 0) - (a.townHallLevel ?? 0) || a.name.localeCompare(b.name),
  )[0];
  return best?.name ?? null;
}
