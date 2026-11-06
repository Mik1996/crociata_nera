import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { PlayerProfile } from '../../../core/models';
import { XpBadge } from '../../../shared/game/xp-badge';
import { roleKey } from '../../../shared/labels';

/** Game-style profile header: Town Hall, experience level, name, clan, league and trophies. */
@Component({
  selector: 'app-player-banner',
  imports: [MatIconModule, MatTooltipModule, TranslatePipe, LocalNumberPipe, XpBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-banner.html',
  styleUrl: './player-banner.scss',
})
export class PlayerBanner {
  readonly profile = input.required<PlayerProfile>();
  protected readonly roleKey = roleKey;
  protected readonly weaponStars = (n: number) => Array.from({ length: n });
}
