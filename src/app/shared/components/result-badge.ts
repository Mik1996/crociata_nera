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
  template: `<span aria-hidden="true">{{ icon() }}</span> {{ 'result.' + result() | translate }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      border: 1px solid currentColor;
    }
    :host(.badge--victory) {
      color: var(--cn-win);
      background: rgba(92, 199, 122, 0.12);
    }
    :host(.badge--defeat) {
      color: var(--cn-red-text);
      background: rgba(229, 83, 75, 0.12);
    }
    :host(.badge--draw) {
      color: var(--cn-text-muted);
      background: rgba(255, 255, 255, 0.06);
    }
    :host(.badge--ongoing) {
      color: var(--cn-gold-light);
      background: rgba(224, 180, 76, 0.12);
    }
  `,
})
export class ResultBadge {
  readonly result = input.required<WarResult>();
  protected readonly icon = computed(() => ICONS[this.result()]);
}
