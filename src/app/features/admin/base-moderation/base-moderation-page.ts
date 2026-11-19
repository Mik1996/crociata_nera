import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseProposal, BaseStatus } from '../../../core/backend/backend-api.types';
import { DefenseBasesService } from '../../../core/backend/defense-bases.service';
import { PendingBaseProposals } from '../../../core/backend/pending-base-proposals';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/components/icon/icon';
import { LoadState } from '../../../shared/components/load-state/load-state';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ScrollFade } from '../../../shared/directives/scroll-fade';
import { BaseArsenal } from '../../bases/base-arsenal';
import { BaseImageDialog, BaseImageDialogData } from '../../bases/components/base-image-dialog';
import { BaseProposalCard } from '../../bases/components/base-proposal-card';
import {
  ProposalDecision,
  ProposalDecisionDialog,
  ProposalDecisionDialogData,
} from './proposal-decision-dialog';

/** The tabs, by their name in the URL (`?tab=rejected`). */
export const MODERATION_TABS: readonly { id: string; status: BaseStatus }[] = [
  { id: 'pending', status: 'PENDING' },
  { id: 'approved', status: 'APPROVED' },
  { id: 'rejected', status: 'REJECTED' },
];

/**
 * Moderation of the bases proposed by the members (administrators): waiting proposals, to approve
 * (published in the arsenal at once) or reject with a reason, and the history of the approved and
 * rejected ones. The tab is in the URL (`?tab=approved`).
 */
@Component({
  selector: 'crn-base-moderation-page',
  imports: [
    MatButtonModule,
    MatTabsModule,
    RouterLink,
    TranslatePipe,
    Icon,
    LoadState,
    PageHeader,
    ScrollFade,
    BaseProposalCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './base-moderation-page.html',
  styleUrl: './base-moderation-page.scss',
})
export class BaseModerationPage {
  private readonly service = inject(DefenseBasesService);
  private readonly arsenal = inject(BaseArsenal);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);

  protected readonly tabs = MODERATION_TABS;
  /** `?tab=pending|approved|rejected`, bound by the router. */
  readonly tab = input<string>();
  protected readonly status = computed(
    () => (MODERATION_TABS.find((t) => t.id === this.tab()) ?? MODERATION_TABS[0]).status,
  );

  protected readonly list = rxResource({
    params: () => this.status(),
    stream: ({ params }) => this.service.proposals(params),
  });
  protected readonly items = computed(() => (this.list.hasValue() ? this.list.value().items : []));
  /** Proposals per state; the last ones known stay while another tab loads. */
  protected readonly counts = linkedSignal<
    Record<BaseStatus, number> | null,
    Record<BaseStatus, number> | null
  >({
    source: () => (this.list.hasValue() ? this.list.value().counts : null),
    computation: (counts, previous) => counts ?? previous?.value ?? null,
  });

  constructor() {
    // The badge of the account menu follows the count of every list read here.
    const pending = inject(PendingBaseProposals);
    effect(() => {
      const counts = this.counts();
      if (counts) pending.set(counts.PENDING);
    });
  }

  protected imageUrl(proposal: BaseProposal): string {
    return this.service.imageUrl(proposal, 'thumb');
  }

  protected openImage(proposal: BaseProposal): void {
    this.dialog.open<BaseImageDialog, BaseImageDialogData>(BaseImageDialog, {
      width: '75rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'dialog',
      data: { base: proposal, imageUrl: this.service.imageUrl(proposal, 'full') },
    });
  }

  /** Asks to confirm, then approves or rejects; the list (and the arsenal) are read again. */
  protected decide(proposal: BaseProposal, decision: ProposalDecision): void {
    this.dialog
      .open<ProposalDecisionDialog, ProposalDecisionDialogData, BaseProposal>(
        ProposalDecisionDialog,
        {
          width: '30rem',
          maxWidth: 'calc(100vw - 2rem)',
          autoFocus: 'first-tabbable',
          data: { proposal, decision, imageUrl: this.imageUrl(proposal) },
        },
      )
      .afterClosed()
      .subscribe((reviewed) => {
        if (!reviewed) return;
        this.list.reload();
        // The arsenal shows an approved base at once, without waiting for its pages to expire.
        if (decision === 'approve') this.arsenal.reset();
        const key = decision === 'approve' ? 'SUCCESS.BASE_APPROVED' : 'SUCCESS.BASE_REJECTED';
        this.snackBar.open(this.language.t(key), undefined, { duration: 4000 });
      });
  }
}
