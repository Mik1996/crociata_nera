import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/** Clan rules (`welcome.rules.<key>.<n>`), from the clan's own regulations. */
const RULE_GROUPS = [
  { key: 'values', icon: 'handshake', items: [1, 2, 3] },
  { key: 'war', icon: 'flag', items: [1, 2, 3] },
  { key: 'capital', icon: 'castle', items: [1, 2, 3] },
  { key: 'forbidden', icon: 'block', items: [1, 2, 3] },
  { key: 'requirements', icon: 'checklist', items: [1, 2, 3] },
] as const;

/** The clan rules on a parchment scroll. Used on the welcome page and on the "Join us" page. */
@Component({
  selector: 'app-clan-rules',
  imports: [MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clan-rules.html',
  styleUrl: './clan-rules.scss',
})
export class ClanRules {
  protected readonly ruleGroups = RULE_GROUPS;
}
