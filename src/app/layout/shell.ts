import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, filter, forkJoin, map, of } from 'rxjs';
import { ClanBadge } from '../core/api/clan-badge';
import { CocApiService } from '../core/api/coc-api';
import { guestRedirect, returnUrlParams } from '../core/backend/auth.guards';
import { AuthService } from '../core/backend/auth.service';
import { APP_CONFIG } from '../core/config/app-config';
import { LanguageService } from '../core/i18n/language.service';
import { LanguageCode } from '../core/i18n/languages';
import { setFavicon } from '../core/theme/favicon';
import { ThemeService } from '../core/theme/theme.service';

interface MenuItem {
  path: string;
  /** Translation key. */
  label: string;
  icon: string;
  /** Open to everyone (signed out, or signed in without access to the clans' pages). */
  public?: boolean;
}

/** Items of the navigation that belong together, under a heading (none for the first group). */
interface MenuGroup {
  /** Translation key of the heading. */
  label?: string;
  items: MenuItem[];
}

/**
 * Main layout: header with the clan name, side navigation and content.
 * The side navigation is always there: signed out it only offers the public pages and the
 * settings (theme and language).
 */
@Component({
  selector: 'app-shell',
  imports: [
    NgTemplateOutlet,
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
  private readonly router = inject(Router);
  /** Absent while signed out (the navigation is not rendered). */
  private readonly sidenav = viewChild(MatSidenav);

  protected readonly clanName = this.config.clanName;
  protected readonly clanTag = this.config.clanTag;
  protected readonly useMock = this.config.useMockApi;

  /** Official clan badge (badgeUrls.large); if missing or failing to load, the SVG crest is shown. */
  protected readonly badgeUrl = inject(ClanBadge).url;
  protected readonly badgeFailed = signal(false);

  protected readonly language = inject(LanguageService);
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(CocApiService);

  /**
   * The clans' pages are only for administrators and members of the clans of the Crusade (always
   * open with mock data).
   */
  private readonly clanAccess = computed(() => this.useMock || this.auth.hasClanAccess());
  protected readonly navOpen = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * "Sign in" keeps the page to come back to: the `returnUrl` set by the guard on the welcome
   * page, or the current page itself.
   */
  /**
   * Verified game accounts of the signed-in user, to open their player page from the account
   * menu (only with access to the clans' pages, where the player page lives). Names come from
   * the API (cached); until they arrive, or if the request fails, the tag is shown.
   */
  private readonly accountTags = computed(() =>
    this.useMock || !this.auth.hasClanAccess()
      ? []
      : this.auth.linkedPlayers().filter((p) => p.verified).map((p) => p.tag),
  );
  private readonly accountNames = rxResource({
    params: () => {
      const tags = this.accountTags();
      return tags.length ? tags : undefined;
    },
    stream: ({ params: tags }) =>
      forkJoin(
        tags.map((tag) =>
          this.api.getPlayer(tag).pipe(
            map((player) => [tag, player?.name ?? tag] as const),
            catchError(() => of([tag, tag] as const)),
          ),
        ),
      ).pipe(map((entries) => new Map<string, string>(entries))),
  });
  protected readonly myAccounts = computed(() => {
    const names = this.accountNames.hasValue() ? this.accountNames.value() : null;
    return this.accountTags().map((tag) => ({ tag, name: names?.get(tag) ?? tag }));
  });

  protected readonly signInParams = computed(() => {
    const url = this.currentUrl();
    return returnUrlParams(this.router.parseUrl(url).queryParams['returnUrl'] ?? url.split('#')[0]);
  });

  constructor() {
    // The browser tab shows the clan badge from the API (static copies in public/ until then).
    const document = inject(DOCUMENT);
    effect(() => {
      const url = this.badgeUrl();
      if (url && !this.badgeFailed()) setFavicon(document, url);
    });

    // Signed out (button, expired or revoked session): leave the protected page for the welcome
    // page, remembering where the user was.
    let wasSignedIn = false;
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      if (wasSignedIn && !signedIn && !this.useMock) {
        untracked(() => void this.router.navigateByUrl(guestRedirect(this.router, this.router.url)));
      }
      wasSignedIn = signedIn;
    });
  }

  protected changeLanguage(code: LanguageCode): void {
    if (code !== this.language.current()) this.language.use(code).subscribe();
  }

  private readonly allMenu: MenuGroup[] = [
    {
      items: [
        { path: '/', label: 'nav.welcome', icon: 'fort', public: true },
        { path: '/join', label: 'nav.join', icon: 'person_add', public: true },
      ],
    },
    {
      label: 'nav.group.clan',
      items: [
        { path: '/players', label: 'nav.players', icon: 'groups' },
        { path: '/statistics', label: 'nav.statistics', icon: 'leaderboard' },
      ],
    },
    {
      label: 'nav.group.battle',
      items: [
        { path: '/dashboard', label: 'nav.dashboard', icon: 'dashboard' },
        { path: '/current-war', label: 'nav.currentWar', icon: 'local_fire_department' },
        { path: '/cwl', label: 'nav.cwl', icon: 'emoji_events' },
        { path: '/raids', label: 'nav.raids', icon: 'castle' },
        { path: '/wars', label: 'nav.history', icon: 'history_edu' },
      ],
    },
    { label: 'nav.group.arsenal', items: [{ path: '/bases', label: 'nav.bases', icon: 'shield' }] },
  ];

  /**
   * Without access to the clans' pages (signed out, or not in a clan of the Crusade): only the
   * public pages (welcome, join us). Settings are always at the bottom.
   */
  protected readonly menu = computed(() => {
    const open = this.clanAccess();
    return this.allMenu
      .map((group) => ({ ...group, items: group.items.filter((i) => open || i.public) }))
      .filter((group) => group.items.length > 0);
  });
  protected readonly settingsItem: MenuItem = { path: '/settings', label: 'nav.settings', icon: 'settings', public: true };

  protected readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Phones: the navigation always floats over the page and cannot be pinned. */
  private readonly phone = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 599.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Tablets and computers can keep the navigation pinned open next to the page. */
  protected readonly canPin = computed(() => !this.phone());

  /** Saved choice of the user; `null` means the default (pinned on wide screens only). */
  private readonly pinPreference = signal<boolean | null>(readPinPreference());

  /**
   * Pinned: the navigation sits next to the page and stays open. Otherwise it floats over the
   * page and closes with a click outside, on Escape or after choosing a page.
   */
  protected readonly pinned = computed(() => this.canPin() && (this.pinPreference() ?? !this.mobile()));

  protected togglePin(): void {
    const pinned = !this.pinned();
    this.pinPreference.set(pinned);
    savePinPreference(pinned);
  }

  protected signOut(): void {
    this.auth.signOut().subscribe();
  }

  protected toggleNav(): void {
    void this.sidenav()?.toggle();
  }

  protected closeIfFloating(): void {
    if (!this.pinned()) {
      void this.sidenav()?.close();
    }
  }
}

const PIN_STORAGE_KEY = 'cn.navigationPinned';

function readPinPreference(): boolean | null {
  try {
    const value = localStorage.getItem(PIN_STORAGE_KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

function savePinPreference(pinned: boolean): void {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, String(pinned));
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this visit only.
  }
}
