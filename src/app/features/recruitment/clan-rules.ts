import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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

/** How the rules are framed: a card with rolled edges, or the bare sheet of a parchment scroll. */
export type ClanRulesVariant = 'card' | 'scroll';

/**
 * The clan rules on parchment. Used on the "Join us" page (`card`, with rolled edges) and on the
 * welcome page (`scroll`: the sheet inside the unrolling scroll of the "Code" act).
 */
@Component({
  selector: 'app-clan-rules',
  imports: [MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clan-rules.html',
  styleUrl: './clan-rules.scss',
  host: { '[class.clan-rules--scroll]': "variant() === 'scroll'" },
})
export class ClanRules {
  readonly variant = input<ClanRulesVariant>('card');

  protected readonly ruleGroups = RULE_GROUPS;
}
