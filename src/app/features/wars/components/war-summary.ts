import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { map, timer } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { War } from '../../../core/models';
import { warResult } from '../../../core/utils/war-stats';
import { ResultBadge } from '../../../shared/components/result-badge';
import { warStateKey } from '../../../shared/labels';

/** Battle scoreboard: our clan versus the opponent. */
@Component({
  selector: 'app-war-summary',
  imports: [LocalNumberPipe, LocalDatePipe, TranslatePipe, MatIconModule, ResultBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './war-summary.html',
  styleUrl: './war-summary.scss',
})
export class WarSummary {
  readonly war = input.required<War>();
  private readonly language = inject(LanguageService);

  private readonly now = toSignal(timer(0, 60_000).pipe(map(() => Date.now())), {
    initialValue: Date.now(),
  });

  protected readonly result = computed(() => warResult(this.war()));
  protected readonly state = computed(() => warStateKey(this.war().state));

  protected readonly timeLeft = computed(() => {
    const w = this.war();
    if (w.state === 'ended') return null;
    const target = new Date(w.state === 'preparation' ? w.startTime : w.endTime).getTime();
    const minutes = Math.max(0, Math.round((target - this.now()) / 60_000));
    const time = this.language.t('summary.time', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    return this.language.t(w.state === 'preparation' ? 'summary.startsIn' : 'summary.endsIn', { time });
  });

  protected totalAttacks(): number {
    return this.war().teamSize * this.war().attacksPerMember;
  }
}
