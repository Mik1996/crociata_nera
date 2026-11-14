import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../../../../shared/icon/icon';
import { IconName } from '../../../../shared/icon/material-icons';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalDatePipe, LocalNumberPipe } from '../../../../core/i18n/locale-pipes';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyTrack } from '../../../../shared/scrolly/scrolly-track';
import { ActHeading } from '../act-heading/act-heading';

/** One of the clan's records: a number, a position (`rank`) or a league name (`text`). */
export interface RecordTile {
  id: string;
  /** Translation key; `{{country}}` for the rankings. */
  label: string;
  country?: string | null;
  value?: number;
  rank?: number;
  text?: string;
  /** Game picture, waving Italian flag, or an icon. */
  image?: string;
  flag?: boolean;
  icon?: IconName;
  achievedAt: string | null;
}

/**
 * Act IV, the annals: the clan's all-time records carved on stone tablets. The act stays pinned
 * while the tablets slide sideways, the one in the middle lit by the torches.
 */
@Component({
  selector: 'app-act-annals',
  imports: [Icon, TranslatePipe, LocalNumberPipe, LocalDatePipe, ActHeading, ScrollyTrack],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-annals.html',
  styleUrl: './act-annals.scss',
})
export class ActAnnals {
  readonly records = input.required<RecordTile[]>();

  /** Vertical slices of the waving flag, each one moving slightly after the previous one. */
  protected readonly flagSlices = Array.from({ length: 26 }, (_, i) => i);
}
