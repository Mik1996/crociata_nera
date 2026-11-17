import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { townHallImage } from '../../core/game/units';

/**
 * Town Hall picture for table cells, with "Town Hall N" as tooltip and accessible name.
 * Falls back to the level number when no picture is available.
 */
@Component({
  selector: 'crn-town-hall-icon',
  imports: [MatTooltipModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './town-hall-icon.html',
  styleUrl: './town-hall-icon.scss',
})
export class TownHallIcon {
  readonly level = input.required<number>();

  protected readonly image = computed(() => townHallImage(this.level()));
}
