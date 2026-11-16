import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CrusadeOrder } from '../../../../core/config/sister-clans';
import { LocalNumberPipe } from '../../../../core/i18n/locale-pipes';
import { ClanMember, ClanRole } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyCounter } from '../../../../shared/scrolly/scrolly-counter';
import { ActHeading } from '../act-heading/act-heading';

/** A clan of the Crusade with its members, as read from the Clash of Clans API. */
export interface LegionClan {
  order: CrusadeOrder;
  name: string;
  members: readonly ClanMember[];
}

/** A name on a banner; `extra` names only repeat a short list so the banner has no gaps. */
export interface BannerName {
  name: string;
  /** Leader or co-leader: larger and brighter. */
  chief: boolean;
  extra: boolean;
}

/** A banner of names marching across the stage. */
export interface Banner {
  order: CrusadeOrder;
  names: BannerName[];
  /** 1 marches to the right, -1 to the left. */
  dir: 1 | -1;
  /** How near the banner is to the camera (0–1): nearer banners are larger and faster. */
  depth: number;
}

/** Banners per clan (one for a clan of a few members). */
const BANNERS_PER_CLAN = 2;
/** A clan with fewer members gets one banner. */
const SPLIT_FROM = 10;
/**
 * Names in one copy of a banner: its track holds two copies and must stay wider than the stage
 * while it marches, so short lists are repeated up to this length.
 */
export const MIN_BANNER_NAMES = 24;
/** Depth of the banners, in turn: near and far alternate. */
const DEPTHS = [1, 0.55, 0.8, 0.45, 0.9, 0.65];

const ROLE_RANK: Record<ClanRole, number> = { leader: 0, coLeader: 1, elder: 2, member: 3 };

/**
 * Splits the members of the three clans into banners: chiefs first, spread over the banners of
 * their clan; banners of the three clans interleaved (black, red, gold, black, …) in alternate
 * directions.
 */
export function buildBanners(clans: readonly LegionClan[]): Banner[] {
  const perClan = clans.map((clan) => {
    const members = [...clan.members].sort(
      (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name),
    );
    const count = members.length >= SPLIT_FROM ? BANNERS_PER_CLAN : members.length ? 1 : 0;
    const groups = Array.from({ length: count }, (_, g) => members.filter((_, i) => i % count === g));
    return groups.map((group) => ({ order: clan.order, names: padNames(group) }));
  });

  const banners: Banner[] = [];
  const rounds = Math.max(0, ...perClan.map((list) => list.length));
  for (let round = 0; round < rounds; round++) {
    for (const list of perClan) {
      const banner = list[round];
      if (!banner) continue;
      const index = banners.length;
      banners.push({ ...banner, dir: index % 2 ? -1 : 1, depth: DEPTHS[index % DEPTHS.length] });
    }
  }
  return banners;
}

function padNames(members: readonly ClanMember[]): BannerName[] {
  const names = members.map((m) => ({
    name: m.name,
    chief: m.role === 'leader' || m.role === 'coLeader',
    extra: false,
  }));
  const padded = [...names];
  while (padded.length < MIN_BANNER_NAMES) {
    padded.push(...names.slice(0, MIN_BANNER_NAMES - padded.length).map((n) => ({ ...n, extra: true })));
  }
  return padded;
}

/**
 * The Crusaders: the names of every member of the three clans march across the stage on banners
 * (one tone per clan, chiefs larger), each banner at its own depth and in its own direction,
 * pushed by the scroll; then the banners fall back and the count of the Crusaders rises.
 *
 * The banners are decoration (`aria-hidden`): the names are also listed, clan by clan, for
 * assistive technologies.
 */
@Component({
  selector: 'crn-act-legion',
  imports: [TranslatePipe, LocalNumberPipe, ActHeading, ScrollyCounter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-legion.html',
  styleUrl: './act-legion.scss',
})
export class ActLegion {
  readonly clans = input.required<readonly LegionClan[]>();

  protected readonly act = inject(ScrollyAct);

  protected readonly banners = computed(() => buildBanners(this.clans()));
  protected readonly total = computed(() =>
    this.clans().reduce((sum, clan) => sum + clan.members.length, 0),
  );
  /** Names of each clan in alphabetical order, for assistive technologies. */
  protected readonly rolls = computed(() =>
    this.clans().map((clan) => ({
      ...clan,
      names: clan.members.map((m) => m.name).sort((a, b) => a.localeCompare(b)),
    })),
  );
}
