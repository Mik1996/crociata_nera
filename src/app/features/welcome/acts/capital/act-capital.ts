import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { capitalHallImage, capitalLeagueIcon } from '../../../../core/game/clan-assets';
import { LocalNumberPipe } from '../../../../core/i18n/locale-pipes';
import { Clan } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyCounter } from '../../../../shared/scrolly/scrolly-counter';
import { Crusader } from '../../crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/**
 * Act II, the capital: the camera flies sideways through the clouds and the Capital Hall rises
 * from them, then its league and points; the Crusader, hand on heart, swears loyalty to it.
 */
@Component({
  selector: 'app-act-capital',
  imports: [TranslatePipe, LocalNumberPipe, ActHeading, Crusader, ScrollyCounter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-capital.html',
  styleUrl: './act-capital.scss',
})
export class ActCapital {
  readonly clan = input.required<Clan>();

  protected readonly hall = computed(() => capitalHallImage(this.clan().capitalHallLevel ?? 0));
  protected readonly leagueIcon = computed(() => capitalLeagueIcon(this.clan().capitalLeague));
}
