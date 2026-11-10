/**
 * Official Clash of Clans link that opens a clan profile in the game (with the "Join" button), in
 * the given language (`it-IT` → `it`). The `#` of the tag is encoded, otherwise it would start a
 * URL fragment.
 */
export function clanProfileLink(tag: string, language: string): string {
  return `https://link.clashofclans.com/${language.slice(0, 2)}?action=OpenClanProfile&tag=${encodeURIComponent(tag)}`;
}
