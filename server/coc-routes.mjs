// Allowlist of the official Clash of Clans API endpoints the proxy forwards.
//
// Only GET, only the paths below, and only the listed query parameters with valid values:
// everything else is refused before calling the API, so the token cannot be used as an
// open relay. Path parameters are validated (tags, numeric ids, season ids) and re-encoded.

const MINUTE = 60_000;

/** `#ABC123`, URL-encoded (`%23ABC123`); case-insensitive, normalised to upper case. */
const TAG = '(%23[0-9A-Za-z]{1,15})';
/** Numeric id (leagues, league tiers, locations). */
const ID = '(\\d{1,12})';
/** Legend League season (`YYYY-MM`). */
const SEASON = '(\\d{4}-\\d{2})';
/** Season id of a league group (format not documented: letters, digits and dashes). */
const GROUP_SEASON = '([0-9A-Za-z_-]{1,32})';

const integer = (min, max) => (value) => /^\d{1,10}$/.test(value) && Number(value) >= min && Number(value) <= max;
const cursor = (value) => /^[A-Za-z0-9=_-]{1,256}$/.test(value);
const oneOf = (...values) => (value) => values.includes(value);

/** Pagination supported by the list endpoints. */
const PAGING = { limit: integer(1, 200), after: cursor, before: cursor };
/** Legend League season rankings: the API wants `limit` between 100 and 25 000 (capped here at 1 000). */
const SEASON_PAGING = { ...PAGING, limit: integer(100, 1000) };

/** Filters of `GET /clans` (clan search). */
const CLAN_SEARCH = {
  ...PAGING,
  name: (value) => value.trim().length >= 3 && value.length <= 50,
  warFrequency: oneOf('always', 'moreThanOncePerWeek', 'oncePerWeek', 'lessThanOncePerWeek', 'never', 'unknown'),
  locationId: integer(1, 999_999_999),
  minMembers: integer(2, 50),
  maxMembers: integer(2, 50),
  minClanPoints: integer(1, 10_000_000),
  minClanLevel: integer(2, 50),
  labelIds: (value) => /^\d{1,12}(,\d{1,12}){0,2}$/.test(value),
};

/**
 * @typedef {{ pattern: RegExp, query: Record<string, (value: string) => boolean>, ttlMs: number }} Route
 * `ttlMs`: how long the proxy keeps the response (static data longer, live data shorter).
 */

/** @param {string} path @param {Record<string, (value: string) => boolean>} [query] @param {number} [ttlMs] */
const route = (path, query = {}, ttlMs = MINUTE) => ({ pattern: new RegExp(`^${path}$`), query, ttlMs });

/** @type {Route[]} */
export const COC_ROUTES = [
  // Players
  route(`/players/${TAG}`),
  route(`/players/${TAG}/battlelog`),
  route(`/players/${TAG}/leaguehistory`, {}, 10 * MINUTE),

  // Clans
  route('/clans', CLAN_SEARCH, 5 * MINUTE),
  route(`/clans/${TAG}`),
  route(`/clans/${TAG}/members`, PAGING),
  route(`/clans/${TAG}/warlog`, PAGING),
  route(`/clans/${TAG}/currentwar`),
  route(`/clans/${TAG}/currentwar/leaguegroup`),
  route(`/clans/${TAG}/capitalraidseasons`, PAGING, 10 * MINUTE),
  // A war of the Clan War League (tags from `currentwar/leaguegroup` rounds).
  route(`/clanwarleagues/wars/${TAG}`),

  // Leagues
  route('/leagues', PAGING, 60 * MINUTE),
  route(`/leagues/${ID}/seasons`, PAGING, 60 * MINUTE),
  route(`/leagues/${ID}/seasons/${SEASON}`, SEASON_PAGING, 60 * MINUTE),
  route('/leaguetiers', PAGING, 60 * MINUTE),
  route(`/leaguetiers/${ID}`, {}, 60 * MINUTE),
  route('/warleagues', PAGING, 60 * MINUTE),
  route(`/warleagues/${ID}`, {}, 60 * MINUTE),
  route('/capitalleagues', PAGING, 60 * MINUTE),
  route(`/capitalleagues/${ID}`, {}, 60 * MINUTE),
  route('/builderbaseleagues', PAGING, 60 * MINUTE),
  route(`/builderbaseleagues/${ID}`, {}, 60 * MINUTE),
  route(`/leaguegroup/${TAG}/${GROUP_SEASON}`, {}, 5 * MINUTE),

  // Locations and rankings
  route('/locations', PAGING, 60 * MINUTE),
  route(`/locations/${ID}`, {}, 60 * MINUTE),
  route(`/locations/${ID}/rankings/clans`, PAGING, 10 * MINUTE),
  route(`/locations/${ID}/rankings/players`, PAGING, 10 * MINUTE),
  route(`/locations/${ID}/rankings/clans-builder-base`, PAGING, 10 * MINUTE),
  route(`/locations/${ID}/rankings/players-builder-base`, PAGING, 10 * MINUTE),
  route(`/locations/${ID}/rankings/capitals`, PAGING, 10 * MINUTE),

  // Gold Pass and labels
  route('/goldpass/seasons/current', {}, 60 * MINUTE),
  route('/labels/clans', PAGING, 60 * MINUTE),
  route('/labels/players', PAGING, 60 * MINUTE),
];

/**
 * Matches a proxy path (without the `/api/coc` prefix) and its query against the allowlist.
 * Returns the upstream path to call (tags upper-cased, query re-built in a stable order, so
 * equivalent requests share the cache) or an error message.
 *
 * @param {string} path e.g. `/clans/%232J8JVVCLC/members`
 * @param {URLSearchParams} searchParams
 * @returns {{ upstream: string, ttlMs: number } | { error: string, status: number }}
 */
export function resolveCocRoute(path, searchParams) {
  const matched = COC_ROUTES.find((r) => r.pattern.test(path));
  if (!matched) return { status: 404, error: `Route not available: ${path}` };

  const upstreamPath = path.replace(/%23[0-9A-Za-z]+/g, (tag) => tag.toUpperCase());
  const query = new URLSearchParams();
  for (const key of [...new Set(searchParams.keys())].sort()) {
    const values = searchParams.getAll(key);
    const valid = matched.query[key];
    if (!valid) return { status: 400, error: `Query parameter not allowed: ${key}` };
    if (values.length > 1 || !valid(values[0])) return { status: 400, error: `Invalid value for ${key}` };
    query.set(key, values[0]);
  }
  const qs = query.toString();
  return { upstream: qs ? `${upstreamPath}?${qs}` : upstreamPath, ttlMs: matched.ttlMs };
}
