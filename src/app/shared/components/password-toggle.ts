import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { Icon } from '../icon/icon';

/**
 * Eye button that shows or hides a password, as the suffix of its field:
 * `<crn-password-toggle matSuffix [(visible)]="showPassword" />` and
 * `[type]="showPassword() ? 'text' : 'password'"` on the input. One signal can drive several
 * fields (password and its confirmation).
 */
@Component({
  selector: 'crn-password-toggle',
  imports: [Icon, MatButtonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-toggle.html',
  styleUrl: './password-toggle.scss',
})
export class PasswordToggle {
  readonly visible = model(false);
}
