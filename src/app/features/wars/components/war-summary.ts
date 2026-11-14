import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { map, timer } from 'rxjs';
import { CLAN_CREST_URL } from '../../../core/api/clan-badge';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { War } from '../../../core/models';
import { warResult } from '../../../core/utils/war-stats';
import { ResultBadge } from '../../../shared/components/result-badge';
import { Crusader } from '../../../shared/crusader/crusader';
import { warStateKey } from '../../../shared/labels';

/**
 * Battle scoreboard: our clan versus the opponent. Each side has a bar of the stars earned out of
 * the stars at stake (three per base). `scenic` is the scoreboard of a scenic page header: the
 * sides hang as banners over the scene, the Crusader stands in the middle behind the score.
 */
@Component({
  selector: 'app-war-summary',
  imports: [LocalNumberPipe, LocalDatePipe, TranslatePipe, MatIconModule, ResultBadge, Crusader],
  host: { '[class.summary--scenic]': 'scenic()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './war-summary.html',
  styleUrl: './war-summary.scss',
})
export class WarSummary {
  readonly war = input.required<War>();
  readonly scenic = input(false, { transform: booleanAttribute });
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

  /** Our badge while the official one is missing or fails to load. */
  protected readonly crestUrl = CLAN_CREST_URL;

  /** Badge URLs that failed to load: our clan falls back to its logo, the opponent's is left out. */
  protected readonly failedBadges = signal<ReadonlySet<string>>(new Set());

  protected badgeFailed(url: string): void {
    this.failedBadges.update((failed) => new Set(failed).add(url));
  }

  /** Stars at stake for each side: three per base. */
  protected readonly maxStars = computed(() => this.war().teamSize * 3);

  /** Share of the stars at stake earned by a side, 0–100. */
  protected starsShare(stars: number): number {
    const max = this.maxStars();
    return max > 0 ? Math.min(100, (stars / max) * 100) : 0;
  }
}
