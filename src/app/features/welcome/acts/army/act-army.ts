import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Clan, ClanRanks } from '../../../../core/models';
import { LocalNumberPipe } from '../../../../core/i18n/locale-pipes';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyCounter } from '../../../../shared/scrolly/scrolly-counter';
import { Crusader } from '../../../../shared/crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/** Clan size limit in Clash of Clans. */
const MAX_MEMBERS = 50;

/** One number of the clan: counted up while scrolling, or a fixed text (e.g. "200+"). */
export interface ArmyStat {
  id: string;
  /** Translation key; `{{country}}` for the country ranking. */
  label: string;
  country?: string | null;
  value?: number;
  text?: string;
  prefix?: string;
  suffix?: string;
  /** Position in a ranking (gold). */
  rank?: boolean;
}

/**
 * Act I, the army: the clan in numbers (members, wars won, win streak, clan points, rankings) on
 * banners that drop one after the other while the numbers count up, with the Crusader on guard
 * in front of his army.
 */
@Component({
  selector: 'app-act-army',
  imports: [TranslatePipe, LocalNumberPipe, ActHeading, Crusader, ScrollyCounter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-army.html',
  styleUrl: './act-army.scss',
})
export class ActArmy {
  readonly clan = input.required<Clan>();
  /** Positions in the rankings: hidden while unknown. */
  readonly ranks = input<ClanRanks | null>(null);
  /** Country of the clan in the current language. */
  readonly country = input<string | null>(null);

  protected readonly stats = computed<ArmyStat[]>(() => {
    const c = this.clan();
    const stats: ArmyStat[] = [
      { id: 'members', label: 'welcome.members', value: c.members.length, suffix: `/${MAX_MEMBERS}` },
      { id: 'warWins', label: 'welcome.warWins', value: c.warWins },
      { id: 'winStreak', label: 'welcome.winStreak', value: c.warWinStreak },
      { id: 'clanPoints', label: 'welcome.clanPoints', value: c.clanPoints },
    ];
    const ranks = this.ranks();
    const country = this.country();
    if (ranks?.local !== undefined && country) {
      stats.push(
        ranks.local
          ? { id: 'rankLocal', label: 'welcome.rankLocal', country, value: ranks.local, prefix: '#', rank: true }
          : { id: 'rankLocal', label: 'welcome.rankLocal', country, text: '200+', rank: true },
      );
    }
    // Worldwide: only within the top 200.
    if (ranks?.global !== undefined && ranks.global !== null && ranks.global <= 200) {
      stats.push({ id: 'rankGlobal', label: 'welcome.rankGlobal', value: ranks.global, prefix: '#', rank: true });
    }
    return stats;
  });
}
