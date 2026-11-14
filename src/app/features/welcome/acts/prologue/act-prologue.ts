import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Clan } from '../../../../core/models';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ScrollyRoot } from '../../../../shared/scrolly/scrolly-root';
import { ClanHero } from '../clan-hero/clan-hero';

/**
 * Prologue: Crociata Nera itself, with the Black Crusader ({@link ClanHero}); the call to action
 * jumps to the last act, the one to join the clan.
 */
@Component({
  selector: 'crn-act-prologue',
  imports: [TranslatePipe, ClanHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-prologue.html',
  styleUrl: './act-prologue.scss',
})
export class ActPrologue {
  readonly clan = input.required<Clan>();
  /** Act with the call to action, target of the "Join" button. */
  readonly joinActId = input('call');

  private readonly root = inject(ScrollyRoot, { optional: true });

  protected join(event: Event): void {
    if (!this.root) return;
    event.preventDefault();
    this.root.scrollTo(this.joinActId());
  }
}
