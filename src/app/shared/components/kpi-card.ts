import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Card showing a numeric indicator. */
@Component({
  selector: 'app-kpi-card',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cn-card kpi', role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    @if (icon()) {
      <mat-icon class="kpi__icon" aria-hidden="true">{{ icon() }}</mat-icon>
    }
    <div class="kpi__text">
      <span class="kpi__label">{{ label() }}</span>
      <span class="kpi__value">{{ value() }}</span>
      @if (hint()) {
        <span class="kpi__hint">{{ hint() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 0.9rem;
      min-width: 0;
    }
    .kpi__icon {
      flex: none;
      font-size: 30px;
      width: 30px;
      height: 30px;
      color: var(--cn-gold);
    }
    .kpi__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .kpi__label {
      font-size: var(--cn-fs-sm);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--cn-text-muted);
    }
    .kpi__value {
      font-family: var(--cn-font-display);
      font-size: var(--cn-fs-2xl);
      font-weight: 700;
      color: var(--cn-gold-light);
      line-height: 1.2;
    }
    .kpi__hint {
      font-size: var(--cn-fs-sm);
      color: var(--cn-text-muted);
    }
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  readonly icon = input<string>();
}
