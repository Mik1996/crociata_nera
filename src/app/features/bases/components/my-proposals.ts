import { ChangeDetectionStrategy, Component, computed, inject, model, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseProposal } from '../../../core/backend/backend-api.types';
import { DefenseBasesService } from '../../../core/backend/defense-bases.service';
import { Icon } from '../../../shared/components/icon/icon';
import { LoadState } from '../../../shared/components/load-state/load-state';
import { Tag } from '../../../shared/components/tag/tag';
import { BaseProposalCard } from './base-proposal-card';

/**
 * "My proposals": the bases the signed-in member proposed that are not approved yet (waiting or
 * rejected, with the reason). Collapsed by default; read when the arsenal opens, so the summary
 * shows how many there are. The page opens the dialogs (`edit`, `withdraw`, `enlarge`) and calls
 * {@link reload} after a change.
 */
@Component({
  selector: 'crn-my-proposals',
  imports: [MatButtonModule, Icon, Tag, TranslatePipe, LoadState, BaseProposalCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-proposals.html',
  styleUrl: './my-proposals.scss',
})
export class MyProposals {
  private readonly service = inject(DefenseBasesService);

  /** The section is expanded. */
  readonly open = model(false);
  readonly edit = output<BaseProposal>();
  readonly withdraw = output<BaseProposal>();
  readonly enlarge = output<BaseProposal>();

  protected readonly proposals = rxResource({ stream: () => this.service.myProposals() });
  protected readonly items = computed(() =>
    this.proposals.hasValue() ? this.proposals.value() : [],
  );
  protected readonly rejected = computed(
    () => this.items().filter((p) => p.status === 'REJECTED').length,
  );

  protected imageUrl(proposal: BaseProposal): string {
    return this.service.imageUrl(proposal, 'thumb');
  }

  protected onToggle(event: Event): void {
    this.open.set((event.target as HTMLDetailsElement).open);
  }

  /** Reads the proposals again (after one is sent, corrected or withdrawn). */
  reload(): void {
    this.proposals.reload();
  }
}
