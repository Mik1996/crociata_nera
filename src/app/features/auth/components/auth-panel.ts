import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CLAN_CREST_URL } from '../../../core/api/clan-badge';
import { Crusader, CrusaderPose } from '../../../shared/components/crusader/crusader';

/**
 * Game-style panel that frames the account forms (sign in, sign up, password, email check), with the
 * Black Crusader in poses chosen by the page: one on each side of the panel on wide screens (the
 * right one mirrored, both facing it), only the first rising behind its banner (in place of the
 * crest) on narrow ones.
 */
@Component({
  selector: 'crn-auth-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-panel.html',
  styleUrl: './auth-panel.scss',
  imports: [Crusader],
})
export class AuthPanel {
  readonly heading = input.required<string>();
  readonly subtitle = input<string>();
  /** Pose of the Crusader standing by the panel; none without it. */
  readonly pose = input<CrusaderPose>();
  /** Pose of the Crusader on the right of the panel (wide screens only); the same as `pose` without it. */
  readonly sidePose = input<CrusaderPose>();

  protected readonly rightPose = computed(() => this.sidePose() ?? this.pose());

  protected readonly crest = CLAN_CREST_URL;
}
