import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LoadedSisterClan } from '../../../../core/api/sister-clans';
import { Clan } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { RecruitmentBanner } from '../../../recruitment/recruitment-banner';
import { Crusader } from '../../crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/**
 * Act VI, the call: the Crusader opens his arms to the reader under rays of light, then the
 * recruitment banner with the in-game links to join Crociata Nera and its sister clans.
 */
@Component({
  selector: 'app-act-call',
  imports: [TranslatePipe, ActHeading, Crusader, RecruitmentBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-call.html',
  styleUrl: './act-call.scss',
})
export class ActCall {
  readonly clan = input.required<Clan>();
  /** Sister clans, recruiting next to Crociata Nera. */
  readonly sisters = input<readonly LoadedSisterClan[]>([]);
}
