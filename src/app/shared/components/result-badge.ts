import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { WarResult } from '../../core/models';
import { Tag, TagTone } from './tag';

const ICONS: Record<WarResult, string> = {
  victory: '▲',
  defeat: '▼',
  draw: '=',
  ongoing: '●',
};

const TONES: Record<WarResult, TagTone> = {
  victory: 'success',
  defeat: 'danger',
  draw: 'neutral',
  ongoing: 'gold',
};

/** Coloured badge with a war result (text + symbol, not colour alone). */
@Component({
  selector: 'crn-result-badge',
  imports: [Tag, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"badge badge--" + result()' },
  templateUrl: './result-badge.html',
  styleUrl: './result-badge.scss',
})
export class ResultBadge {
  readonly result = input.required<WarResult>();
  protected readonly icon = computed(() => ICONS[this.result()]);
  protected readonly tone = computed(() => TONES[this.result()]);
}
