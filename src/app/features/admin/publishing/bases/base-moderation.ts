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
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  BaseProposal,
  BaseStatus,
  ModeratedBaseProposal,
} from '../../../../core/backend/backend-api.types';
import { DefenseBasesService } from '../../../../core/backend/defense-bases.service';
import { PendingPublications } from '../../../../core/backend/pending-publications';
import { LanguageService } from '../../../../core/i18n/language.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { LoadState } from '../../../../shared/components/load-state/load-state';
import { BaseArsenal } from '../../../bases/base-arsenal';
import { BaseImageDialog, BaseImageDialogData } from '../../../bases/components/base-image-dialog';
import { BaseProposalCard } from '../../../bases/components/base-proposal-card';
import {
  ProposalDecision,
  ProposalDecisionDialog,
  ProposalDecisionDialogData,
} from './proposal-decision-dialog';
import { ProposalTelegram } from './proposal-telegram';

/** The states, by their name in the URL (`?status=rejected`); the first one is the default. */
export const MODERATION_STATES: readonly { id: string; status: BaseStatus }[] = [
  { id: 'pending', status: 'PENDING' },
  { id: 'approved', status: 'APPROVED' },
  { id: 'rejected', status: 'REJECTED' },
];

/**
 * "Bases" tab of the Publications page (administrators): the bases proposed by the members.
 * Waiting ones, to approve (published in the arsenal at once, and in the Telegram channel of their
 * town hall) or reject with a reason, and the history of the approved and rejected ones; each card
 * tells where the base goes (or went) on Telegram. The state is in the URL (`?status=approved`).
 */
@Component({
  selector: 'crn-base-moderation',
  imports: [
    MatButtonModule,
    MatChipsModule,
    TranslatePipe,
    Icon,
    LoadState,
    BaseProposalCard,
    ProposalTelegram,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './base-moderation.html',
  styleUrl: './base-moderation.scss',
})
export class BaseModeration {
  private readonly service = inject(DefenseBasesService);
  private readonly arsenal = inject(BaseArsenal);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly states = MODERATION_STATES;
  /** `pending` (default), `approved` or `rejected`: `?status=` of the page. */
  readonly status = input<string>();
  protected readonly current = computed(
    () => (MODERATION_STATES.find((s) => s.id === this.status()) ?? MODERATION_STATES[0]).status,
  );

  protected readonly list = rxResource({
    params: () => this.current(),
    stream: ({ params }) => this.service.proposals(params),
  });
  protected readonly items = computed<ModeratedBaseProposal[]>(() =>
    this.list.hasValue() ? this.list.value().items : [],
  );
  /** Proposals per state; the last ones known stay while another state loads. */
  protected readonly counts = linkedSignal<
    Record<BaseStatus, number> | null,
    Record<BaseStatus, number> | null
  >({
    source: () => (this.list.hasValue() ? this.list.value().counts : null),
    computation: (counts, previous) => counts ?? previous?.value ?? null,
  });

  constructor() {
    // The badges (menu, tab) follow the count of every list read here.
    const pending = inject(PendingPublications);
    effect(() => {
      const counts = this.counts();
      if (counts) pending.set('bases', counts.PENDING);
    });
  }

  protected select(status: BaseStatus | undefined): void {
    // Clicking the chip already selected leaves it selected.
    if (!status || status === this.current()) return;
    const id = MODERATION_STATES.find((s) => s.status === status)!.id;
    void this.router.navigate([], {
      queryParams: { status: id === MODERATION_STATES[0].id ? null : id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
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
  protected decide(proposal: ModeratedBaseProposal, decision: ProposalDecision): void {
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
