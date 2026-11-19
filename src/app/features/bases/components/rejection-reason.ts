import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Icon } from '../../../shared/components/icon/icon';

/** Why an administrator rejected a proposal, as its author and the moderation see it. */
@Component({
  selector: 'crn-rejection-reason',
  imports: [Icon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'note' },
  templateUrl: './rejection-reason.html',
  styleUrl: './rejection-reason.scss',
})
export class RejectionReason {
  readonly reason = input.required<string>();
}
