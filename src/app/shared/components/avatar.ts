import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initials } from '../../core/utils/initials';

/** `s`: next to a name in a button or a row; `l`: identity card (profile). */
export type AvatarSize = 's' | 'l';

/** Round badge with the initials of a name (the site's users have no pictures). Decorative. */
@Component({
  selector: 'crn-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'avatar avatar--' + size()", 'aria-hidden': 'true' },
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input<AvatarSize>('s');
  /** How many initials (one for usernames, two for names of several words). */
  readonly letters = input(1);

  protected readonly text = computed(() => initials(this.name(), this.letters()));
}
