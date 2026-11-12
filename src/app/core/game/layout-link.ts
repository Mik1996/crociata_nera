/** Highest town hall level accepted in a layout link (room for future game updates). */
export const MAX_TOWN_HALL_LEVEL = 30;

/**
 * Layout id of a home village base, `TH<level>:<layout type>:<data>`: the type is `HV` (village),
 * `WB` (war base) and so on, e.g. `TH18:WB:AAAAFAAAAALLzhLmlzF4S8AYmJtI0bdX`. Builder base layouts
 * start with `BH` instead and are refused.
 */
const LAYOUT_ID = /^TH(\d{1,2}):[A-Z]{2}:[A-Za-z0-9_\-+/=]{8,200}$/;
/** `/en`, `/en/`, `/it`, `/pt-br`… or no language at all. */
const LANGUAGE_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i;

/**
 * Town hall level of an in-game "copy base" link
 * (`https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3A…`); `null` when the text is
 * not a link to a home village layout. Same rules as the backend (`backend/src/modules/bases/layout-link.ts`).
 */
export function layoutLinkTownHall(text: string): number | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'link.clashofclans.com') return null;
  if (!LANGUAGE_PATH.test(url.pathname) || url.searchParams.get('action') !== 'OpenLayout') return null;

  // Read the raw value: URLSearchParams would turn a `+` of the id into a space.
  const rawId = url.search.match(/[?&]id=([^&]*)/)?.[1] ?? '';
  let layoutId: string;
  try {
    layoutId = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  const level = Number(layoutId.match(LAYOUT_ID)?.[1]);
  return level >= 1 && level <= MAX_TOWN_HALL_LEVEL ? level : null;
}
