import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ScrollyRoot } from './scrolly-root';

/**
 * Index of a scrollytelling page: one mark per labelled act (roman numeral, name on wide screens),
 * the current one highlighted. Jumps to an act and moves the focus there.
 */
@Component({
  selector: 'crn-scrolly-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scrolly-index.html',
  styleUrl: './scrolly-index.scss',
})
export class ScrollyIndex {
  /** Accessible name of the navigation. */
  readonly label = input.required<string>();

  protected readonly root = inject(ScrollyRoot);

  protected readonly items = computed(() =>
    this.root
      .acts()
      .filter((act) => act.actLabel())
      .map((act) => ({ id: act.actId(), label: act.actLabel(), numeral: act.numeral() })),
  );
}
