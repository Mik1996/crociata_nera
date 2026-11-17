import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { Tag } from './tag';

/**
 * Player name in a table cell: link to the profile, the "You" tag on the signed-in user's
 * accounts, optionally the player tag below. Projected `crn-tag`s go next to the name, any other
 * content below it (meta lines, flags, warnings).
 */
@Component({
  selector: 'crn-player-cell',
  imports: [RouterLink, Tag, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-cell.html',
  styleUrl: './player-cell.scss',
})
export class PlayerCell {
  readonly tag = input.required<string>();
  readonly name = input.required<string>();
  /** Links to the profile (off for players who left the clan). */
  readonly link = input(true, { transform: booleanAttribute });
  /** Shows the player tag under the name. */
  readonly showTag = input(false, { transform: booleanAttribute });
  /** Clicking the name does not reach the row (rows with their own click). */
  readonly stopPropagation = input(false, { transform: booleanAttribute });

  private readonly isMyPlayer = inject(AuthService).isMyPlayer;
  protected readonly mine = computed(() => this.isMyPlayer(this.tag()));

  protected linkClicked(event: Event): void {
    if (this.stopPropagation()) event.stopPropagation();
  }
}
