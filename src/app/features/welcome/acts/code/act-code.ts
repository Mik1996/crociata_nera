import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ClanRules } from '../../../recruitment/clan-rules';
import { Crusader } from '../../crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/**
 * Act V, the code: the Crusader takes the oath and the clan rules unroll on a parchment scroll as
 * the reader goes down. Not pinned: the sheet is revealed down to a line near the bottom of the
 * scrollport and the lower roller follows that line.
 * The scroll is an act of its own (without a label), for its position.
 */
@Component({
  selector: 'app-act-code',
  imports: [TranslatePipe, ActHeading, Crusader, ClanRules, ScrollyAct],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-code.html',
  styleUrl: './act-code.scss',
})
export class ActCode {}
