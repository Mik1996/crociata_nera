import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { CocApiService } from '../core/api/coc-api';
import { APP_CONFIG } from '../core/config/app-config';
import { LanguageService } from '../core/i18n/language.service';
import { LanguageCode } from '../core/i18n/languages';

interface MenuItem {
  path: string;
  /** Translation key. */
  label: string;
  icon: string;
}

/** Main layout: header with the clan name, side navigation and content. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly config = inject(APP_CONFIG);
  private readonly sidenav = viewChild.required(MatSidenav);

  protected readonly clanName = this.config.clanName;
  protected readonly clanTag = this.config.clanTag;
  protected readonly useMock = this.config.useMockApi;

  /** Official clan badge (badgeUrls.large); if missing or failing to load, the SVG crest is shown. */
  protected readonly badgeUrl = toSignal(
    inject(CocApiService)
      .getClan()
      .pipe(
        map((clan) => clan.badgeUrl ?? null),
        catchError(() => of(null)),
      ),
    { initialValue: null },
  );
  protected readonly badgeFailed = signal(false);

  protected readonly language = inject(LanguageService);

  protected changeLanguage(code: LanguageCode): void {
    if (code !== this.language.current()) this.language.use(code).subscribe();
  }

  protected readonly menu: MenuItem[] = [
    { path: '/dashboard', label: 'nav.dashboard', icon: 'dashboard' },
    { path: '/current-war', label: 'nav.currentWar', icon: 'local_fire_department' },
    { path: '/wars', label: 'nav.history', icon: 'history_edu' },
    { path: '/players', label: 'nav.players', icon: 'groups' },
    { path: '/statistics', label: 'nav.statistics', icon: 'leaderboard' },
  ];

  protected readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly mode = computed(() => (this.mobile() ? 'over' : 'side'));

  protected closeIfMobile(): void {
    if (this.mobile()) {
      void this.sidenav().close();
    }
  }
}
