import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-names';

/** One choice of a `crn-select`: the label is shown as it is (already translated). */
export interface SelectOption<T> {
  value: T;
  label: string;
  /** Picture before the label (e.g. a town hall), also shown in place of the icon when chosen. */
  image?: string;
}

/**
 * Drop-down choice in an outlined field (season, weekend, period, minimum wars…), with an optional
 * icon before the value (the picture of the chosen option, when it has one). Bind `[value]` and
 * `(valueChange)`, or `[(value)]`; give it a width (e.g. `min-width`) from the page.
 */
@Component({
  selector: 'crn-select',
  imports: [Icon, MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './select.html',
  styleUrl: './select.scss',
})
export class Select<T> {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly icon = input<IconName>();
  readonly value = model<T>();

  protected readonly selected = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
}
