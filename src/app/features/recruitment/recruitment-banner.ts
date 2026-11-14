import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { CLAN_CRESTS } from '../../core/api/clan-badge';
import { LoadedSisterClan } from '../../core/api/sister-clans';
import { CrusadeOrder } from '../../core/config/sister-clans';
import { clanProfileLink } from '../../core/game/clan-link';
import { townHallImage } from '../../core/game/units';
import { LanguageService } from '../../core/i18n/language.service';
import { Clan } from '../../core/models';

/** Clan size limit in Clash of Clans. */
const MAX_MEMBERS = 50;

/** One clan that recruits: open spots, requirements and the in-game link. */
interface Enlistment {
  clan: Clan;
  order: CrusadeOrder;
  openSlots: number;
  townHallImage?: string;
  joinUrl: string;
}

let nextId = 0;

/**
 * Recruitment pitch and one card per clan of the Crusade (Crociata Nera first, then the sister
 * clans): open spots, requirements and the official in-game link that opens the clan profile.
 * Used on the welcome page and on the "Join us" page.
 */
@Component({
  selector: 'app-recruitment-banner',
  imports: [MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recruitment-banner.html',
  styleUrl: './recruitment-banner.scss',
})
export class RecruitmentBanner {
  /** Crociata Nera. */
  readonly clan = input.required<Clan>();
  /** Sister clans, in display order (those that could not be read are missing). */
  readonly sisters = input<readonly LoadedSisterClan[]>([]);

  private readonly language = inject(LanguageService);

  /** Logos of the clans, shown while their official badge is missing or fails to load. */
  protected readonly crests = CLAN_CRESTS;

  /** Badge URLs that failed to load: a clan falls back to its logo, left out if that fails too. */
  protected readonly failedBadges = signal<ReadonlySet<string>>(new Set());

  protected badgeFailed(url: string): void {
    this.failedBadges.update((failed) => new Set(failed).add(url));
  }

  /** Unique ids: the banner may appear more than once in the app. */
  protected readonly titleId = `recruit-title-${nextId++}`;

  protected readonly enlistments = computed<Enlistment[]>(() => {
    const language = this.language.current();
    const card = (clan: Clan, order: CrusadeOrder): Enlistment => ({
      clan,
      order,
      openSlots: Math.max(0, MAX_MEMBERS - clan.members.length),
      townHallImage: clan.requiredTownHall ? townHallImage(clan.requiredTownHall) : undefined,
      joinUrl: clanProfileLink(clan.tag, language),
    });
    return [card(this.clan(), 'black'), ...this.sisters().map((s) => card(s.clan, s.sister.order))];
  });

  /** Recruitment is open while at least one of the clans has a free spot. */
  protected readonly open = computed(() => this.enlistments().some((e) => e.openSlots > 0));
}
