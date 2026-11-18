import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-names';

/** `error` red (announced at once), `success` green, `warning` gold, `info` muted. */
export type AlertTone = 'error' | 'success' | 'warning' | 'info';

const DEFAULT_ICONS: Record<AlertTone, IconName | null> = {
  error: 'error',
  success: 'check_circle',
  warning: 'warning_amber',
  info: null,
};

/**
 * Message box with an icon and the projected text: a failed sign-in, a link sent, a missing token,
 * "offline". Errors are `role="alert"`, the others `role="status"`. `icon` replaces the tone's
 * icon (`null`: none, e.g. when a spinner is projected).
 */
@Component({
  selector: 'crn-alert',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'alert alert--' + tone()",
    '[attr.role]': "tone() === 'error' ? 'alert' : 'status'",
  },
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
})
export class Alert {
  readonly tone = input<AlertTone>('error');
  readonly icon = input<IconName | null | undefined>(undefined);

  protected readonly iconName = computed(() => {
    const icon = this.icon();
    return icon === undefined ? DEFAULT_ICONS[this.tone()] : icon;
  });
}
