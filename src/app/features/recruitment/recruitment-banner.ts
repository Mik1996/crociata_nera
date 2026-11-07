import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { APP_CONFIG } from '../../core/config/app-config';
import { townHallImage } from '../../core/game/units';
import { LanguageService } from '../../core/i18n/language.service';
import { Clan } from '../../core/models';

/** Clan size limit in Clash of Clans. */
const MAX_MEMBERS = 50;

interface Perk {
  /** Translation keys `welcome.recruit.perks.<key>.title|text`. */
  key: string;
  icon: string;
  /** Icon colour of the sister clans (Crociata Rossa, Crociata d'Oro). */
  tone?: 'red' | 'gold';
}

/** Reasons to join, in display order. */
const PERKS: readonly Perk[] = [
  { key: 'wars', icon: 'local_fire_department' },
  { key: 'league', icon: 'emoji_events' },
  { key: 'capital', icon: 'castle' },
  { key: 'clanGames', icon: 'celebration' },
  { key: 'cwl', icon: 'forum' },
  { key: 'redCrusade', icon: 'shield', tone: 'red' },
  { key: 'goldCrusade', icon: 'shield', tone: 'gold' },
  { key: 'honours', icon: 'military_tech' },
];

let nextId = 0;

/**
 * Recruitment pitch: why join, open spots, requirements and the official in-game link that
 * opens the clan profile. Used on the welcome page and on the "Join us" page.
 */
@Component({
  selector: 'app-recruitment-banner',
  imports: [MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recruitment-banner.html',
  styleUrl: './recruitment-banner.scss',
})
export class RecruitmentBanner {
  readonly clan = input.required<Clan>();

  private readonly clanTag = inject(APP_CONFIG).clanTag;
  private readonly language = inject(LanguageService);

  /** Unique heading id: the banner may appear more than once in the app. */
  protected readonly titleId = `recruit-title-${nextId++}`;
  protected readonly perks = PERKS;

  /** Picture of the minimum Town Hall required to join. */
  protected readonly townHallImage = computed(() => {
    const level = this.clan().requiredTownHall;
    return level ? townHallImage(level) : undefined;
  });

  protected readonly openSlots = computed(() => Math.max(0, MAX_MEMBERS - this.clan().members.length));

  /**
   * Official Clash of Clans link that opens the clan profile in the game (with the "Join"
   * button). The `#` of the tag must be encoded, otherwise it would start a URL fragment.
   */
  protected readonly joinUrl = computed(
    () =>
      `https://link.clashofclans.com/${this.language.current().slice(0, 2)}` +
      `?action=OpenClanProfile&tag=${encodeURIComponent(this.clanTag)}`,
  );
}
