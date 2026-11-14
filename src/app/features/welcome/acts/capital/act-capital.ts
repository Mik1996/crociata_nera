import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CAPITAL_PEAK_ID, capitalHallImage, capitalLeagueIcon, districtHallImage } from '../../../../core/game/clan-assets';
import { LocalNumberPipe } from '../../../../core/i18n/locale-pipes';
import { Clan } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyCounter } from '../../../../shared/scrolly/scrolly-counter';
import { Crusader } from '../../../../shared/crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/**
 * How near each district is to the camera, in turn: the sign is the side it flies in from, the
 * size how much it travels while the act scrolls.
 */
const DEPTHS = [-1, 0.6, -0.75, 1, 0.8, -0.6, 0.95, -0.85];

/**
 * Act II, the capital: the camera glides over the Clan Capital, the Capital Hall rises and the
 * districts fly in around it like floating islands, each at its own depth; then league and
 * points. The Crusader, hand on heart, swears loyalty to it.
 */
@Component({
  selector: 'crn-act-capital',
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

  /** The districts around Capital Peak (whose hall is the Capital Hall, shown on its own). */
  protected readonly districts = computed(() =>
    (this.clan().capitalDistricts ?? [])
      .filter((district) => district.id !== CAPITAL_PEAK_ID)
      .map((district, index) => ({
        ...district,
        name: district.name.replaceAll(' ', '_').toLowerCase(),
        image: districtHallImage(district.level),
        depth: DEPTHS[index % DEPTHS.length],
        speed: Math.abs(DEPTHS[index % DEPTHS.length]),
      })),
  );
}
