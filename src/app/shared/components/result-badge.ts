import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { WarResult } from '../../core/models';
import { TranslatePipe } from '@ngx-translate/core';

const ICONS: Record<WarResult, string> = {
  victory: '▲',
  defeat: '▼',
  draw: '=',
  ongoing: '●',
};

/** Coloured badge with a war result (text + symbol, not colour alone). */
@Component({
  selector: 'app-result-badge',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"badge badge--" + result()' },
  templateUrl: './result-badge.html',
  styleUrl: './result-badge.scss',
})
export class ResultBadge {
  readonly result = input.required<WarResult>();
  protected readonly icon = computed(() => ICONS[this.result()]);
}
