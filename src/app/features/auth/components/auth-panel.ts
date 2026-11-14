import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Game-style panel that frames the sign-in and sign-up forms. */
@Component({
  selector: 'crn-auth-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-panel.html',
  styleUrl: './auth-panel.scss',
})
export class AuthPanel {
  readonly heading = input.required<string>();
  readonly subtitle = input<string>();
}
