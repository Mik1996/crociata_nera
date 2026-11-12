import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import {
  ClanCastleTroop,
  clanCastleCapacity,
  housingSpaceUsed,
  troopInfo,
} from '../../../core/game/clan-castle';

/** Clan castle reinforcements of a base (read only): troop pictures with their count. */
@Component({
  selector: 'app-clan-castle-troops',
  imports: [MatTooltipModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clan-castle-troops.html',
  styleUrl: './clan-castle-troops.scss',
})
export class ClanCastleTroops {
  readonly troops = input.required<ClanCastleTroop[]>();
  readonly townHallLevel = input.required<number>();

  protected readonly items = computed(() =>
    this.troops().map((troop) => ({ ...troop, icon: troopInfo(troop.name)?.icon })),
  );
  protected readonly used = computed(() => housingSpaceUsed(this.troops()));
  protected readonly capacity = computed(() => clanCastleCapacity(this.townHallLevel()));
}
