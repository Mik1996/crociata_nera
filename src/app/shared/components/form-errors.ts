import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage } from '../../core/backend/backend-api.types';

/**
 * Error messages of a form or dialog (backend `MessageKey`s with their parameters), one line each,
 * announced as alerts. Shows nothing when the list is empty.
 */
@Component({
  selector: 'crn-form-errors',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-errors.html',
  styleUrl: './form-errors.scss',
})
export class FormErrors {
  readonly messages = input<readonly BackendMessage[]>([]);
}
