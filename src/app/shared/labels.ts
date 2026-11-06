import { ClanRole, WarResult, WarState } from '../core/models';

/** Translation keys for game data labels (see `public/i18n/*.json`). */
export const resultKey = (r: WarResult) => `result.${r}`;
export const warStateKey = (s: WarState) => `warState.${s}`;
export const roleKey = (r: ClanRole) => `role.${r}`;

export const CLAN_ROLES: readonly ClanRole[] = ['leader', 'coLeader', 'elder', 'member'];
