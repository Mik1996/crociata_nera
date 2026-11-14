import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';

/**
 * Title of an act: "Act II" kicker (numbered by the scrollytelling engine), name and motto.
 * `heading` false renders the name as plain text, for acts whose content brings its own title.
 */
@Component({
  selector: 'crn-act-heading',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './act-heading.html',
  styleUrl: './act-heading.scss',
})
export class ActHeading {
  readonly title = input.required<string>();
  readonly tagline = input('');
  readonly heading = input(true);
  readonly titleId = input<string | null>(null);

  protected readonly act = inject(ScrollyAct, { optional: true });
}
