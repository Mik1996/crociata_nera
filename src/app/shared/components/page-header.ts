import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page header with title, subtitle and optional actions. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h1 class="title">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="subtitle">{{ subtitle() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 0.5rem 0.75rem;
      margin-bottom: 0.9rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--cn-border);
    }
    .title {
      margin: 0;
      font-family: var(--cn-font-display);
      font-weight: 700;
      font-size: var(--cn-fs-2xl);
      color: var(--cn-heading);
      text-shadow: var(--cn-heading-shadow);
    }
    .subtitle {
      margin: 0.15rem 0 0;
      color: var(--cn-text-muted);
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
