import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { warLeagueIcon } from '../../../../core/game/clan-assets';
import { LocalNumberPipe } from '../../../../core/i18n/locale-pipes';
import { Clan } from '../../../../core/models';
import { Altar3d } from '../../../../shared/altar-3d/altar-3d';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyCounter } from '../../../../shared/scrolly/scrolly-counter';
import { Crusader } from '../../../../shared/crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/** Picture of the altar when the clan has no Clan War League trophy. */
const NO_LEAGUE_IMAGE = 'game/misc/clan-war.webp';

/**
 * Act III, war: the Clan War League trophy floats on a 3D altar while the camera circles it, the
 * war record fills its bar and the Crusader raises his fist. The 3D scene (Three.js) is loaded
 * when the act gets close; until then, and without WebGL, the trophy picture is shown.
 */
@Component({
  selector: 'crn-act-war',
  imports: [TranslatePipe, LocalNumberPipe, ActHeading, Crusader, ScrollyCounter, Altar3d],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-war.html',
  styleUrl: './act-war.scss',
})
export class ActWar {
  readonly clan = input.required<Clan>();

  protected readonly act = inject(ScrollyAct);
  /** The 3D altar is on screen: the flat trophy steps aside. */
  protected readonly altarReady = signal(false);

  protected readonly trophy = computed(() => warLeagueIcon(this.clan().warLeague?.name) ?? NO_LEAGUE_IMAGE);

  /** Wins, ties and losses, with their share of the played wars. */
  protected readonly record = computed(() => {
    const c = this.clan();
    const played = c.warWins + c.warTies + c.warLosses;
    const share = (n: number) => (played ? n / played : 0);
    return {
      played,
      winRate: played ? Math.round((c.warWins / played) * 100) : null,
      parts: [
        { id: 'win', label: 'welcome.warLeague.wins', value: c.warWins, share: share(c.warWins) },
        { id: 'tie', label: 'welcome.warLeague.ties', value: c.warTies, share: share(c.warTies) },
        { id: 'loss', label: 'welcome.warLeague.losses', value: c.warLosses, share: share(c.warLosses) },
      ],
    };
  });
}
