import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SisterClan } from '../../../../core/config/sister-clans';
import { clanProfileLink } from '../../../../core/game/clan-link';
import { LanguageService } from '../../../../core/i18n/language.service';
import { Clan } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ClanHero } from '../clan-hero/clan-hero';

/**
 * A sister clan (Crociata Rossa, Crociata d'Oro), presented like the prologue with its own
 * Crusader and tones ({@link ClanHero}); the call to action opens the clan in the game.
 */
@Component({
  selector: 'crn-act-sister',
  imports: [TranslatePipe, ClanHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-sister.html',
  styleUrl: './act-sister.scss',
})
export class ActSister {
  /** Data of the clan, from the Clash of Clans API. */
  readonly clan = input.required<Clan>();
  readonly sister = input.required<SisterClan>();

  protected readonly act = inject(ScrollyAct);
  private readonly language = inject(LanguageService);

  protected readonly link = computed(() => clanProfileLink(this.clan().tag, this.language.current()));
}
