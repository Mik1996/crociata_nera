import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseProposal } from '../../../core/backend/backend-api.types';
import { layoutLinkType } from '../../../core/game/layout-link';
import { townHallImage } from '../../../core/game/units';
import { LocalDatePipe } from '../../../core/i18n/locale-pipes';
import { Icon } from '../../../shared/components/icon/icon';
import { Tag, TagTone } from '../../../shared/components/tag/tag';
import { ClanCastleTroops } from './clan-castle-troops';
import { RejectionReason } from './rejection-reason';

/** Layout types with a name of their own; the others show their code. */
const KNOWN_LAYOUT_TYPES = new Set(['HV', 'WB']);

const STATUS_TONE: Record<BaseProposal['status'], TagTone> = {
  PENDING: 'gold',
  APPROVED: 'success',
  REJECTED: 'danger',
};

/**
 * A base proposed by a member: screenshot (enlarged on click), town hall, layout type, state, who
 * sent it and when, review, reinforcements, description and the in-game link. The actions of the
 * page (approve, correct, withdraw…) are projected at the bottom; an element marked `proposalNote`
 * goes above them (extra facts of the page).
 */
@Component({
  selector: 'crn-base-proposal-card',
  imports: [
    MatButtonModule,
    Icon,
    Tag,
    TranslatePipe,
    LocalDatePipe,
    ClanCastleTroops,
    RejectionReason,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cn-card cn-card--plain' },
  templateUrl: './base-proposal-card.html',
  styleUrl: './base-proposal-card.scss',
})
export class BaseProposalCard {
  readonly proposal = input.required<BaseProposal>();
  /** Thumbnail of the screenshot. */
  readonly imageUrl = input.required<string>();
  /** Shows who proposed it (moderation); the author's own list leaves it out. */
  readonly showAuthor = input(false, { transform: booleanAttribute });
  /** The screenshot was clicked: show it full size. */
  readonly enlarge = output<void>();

  protected readonly townHallImage = computed(
    () => townHallImage(this.proposal().townHallLevel) ?? null,
  );
  protected readonly statusTone = computed(() => STATUS_TONE[this.proposal().status]);
  /** Translation key of the layout type, and the code for the types without a name. */
  protected readonly layoutType = computed(() => {
    const code = layoutLinkType(this.proposal().layoutUrl);
    if (!code) return null;
    return KNOWN_LAYOUT_TYPES.has(code)
      ? { key: `bases.layoutType.${code}`, code }
      : { key: 'bases.layoutType.other', code };
  });
}
