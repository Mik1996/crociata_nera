import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../../shared/icon/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { CLAN_CRESTS } from '../../../../core/api/clan-badge';
import { CrusadeOrder } from '../../../../core/config/sister-clans';
import { Clan } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { Crusader } from '../../../../shared/crusader/crusader';

/** Progress from which the motto and the call to action are visible (see `--finale` in the styles). */
const FINALE_AT = 0.6;

/**
 * Pinned stage presenting a clan of the Crusade: the flaming name and the badge under a dusk sky;
 * scrolling, the badge settles as a crest, the clan's Crusader rises from the fog among the ruins
 * and the clan motto appears with a call to action. Used by the prologue (Crociata Nera) and by
 * the acts of the sister clans, each with its own tones (`order`).
 *
 * Must be the only content of a {@link ScrollyAct} host: it renders the act's stage.
 */
@Component({
  selector: 'crn-clan-hero',
  imports: [NgTemplateOutlet, Icon, TranslatePipe, Crusader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clan-hero.html',
  styleUrl: './clan-hero.scss',
  host: {
    '[class.clan-hero--black]': "order() === 'black'",
    '[class.clan-hero--red]': "order() === 'red'",
    '[class.clan-hero--gold]': "order() === 'gold'",
  },
})
export class ClanHero {
  readonly clan = input.required<Clan>();
  readonly order = input<CrusadeOrder>('black');
  /** `h1` for the clan of the site, `h2` for the others. */
  readonly headingLevel = input<1 | 2>(2);
  readonly titleId = input.required<string>();
  /** Line above the name (e.g. "Act VI · Sister clan"). */
  readonly kicker = input<string | null>(null);
  readonly ctaLabel = input.required<string>();
  readonly ctaHref = input.required<string>();
  /** The call to action opens another site (the game) in a new tab. */
  readonly ctaExternal = input(false);
  /** "Scroll" hint at the bottom, for the first act. */
  readonly hint = input(false);
  /** First act on screen: pictures loaded at once. */
  readonly priority = input(false);
  readonly cta = output<Event>();

  /** Official badge failed to load: the heraldic placeholder is shown instead. */
  protected readonly badgeFailed = signal(false);
  /** Logo of the clan, shown when its official badge is missing or fails to load. */
  protected readonly crestUrl = computed(() => CLAN_CRESTS[this.order()]);
  protected readonly crestFailed = signal(false);

  protected readonly embers = Array.from({ length: 14 }, (_, i) => i + 1);

  /** Motto and call to action, faded in late: out of reach (focus, clicks) while invisible. */
  protected readonly finaleShown = signal(false);

  constructor() {
    const stop = inject(ScrollyAct).onFrame((m) => this.finaleShown.set(m.progress >= FINALE_AT));
    inject(DestroyRef).onDestroy(stop);
  }
}
