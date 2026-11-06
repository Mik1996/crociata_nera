import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { GAME_ICONS } from '../../core/game/game-assets';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { PlayerUnit } from '../../core/models';
import { PlayerService } from '../../core/services/player.service';
import { LoadState } from '../../shared/components/load-state';
import { LevelBadge } from '../../shared/game/level-badge';
import { UnitTile } from '../../shared/game/unit-tile';
import { PlayerBanner } from './components/player-banner';
import { PlayerWarStats } from './components/player-war-stats';
import { ScrollFade } from '../../shared/directives/scroll-fade';

interface ArmySection {
  /** Translation key of the section title. */
  title: string;
  units: (PlayerUnit & { active?: boolean })[];
}

/** Player page in the style of the game profile: banner plus Profile, Army, Achievements and Wars tabs. */
@Component({
  selector: 'app-player-detail-page',
  imports: [
    TranslatePipe,
    LocalNumberPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    LoadState,
    UnitTile,
    LevelBadge,
    PlayerBanner,
    PlayerWarStats,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './player-detail-page.html',
  styleUrl: './player-detail-page.scss',
})
export class PlayerDetailPage {
  private readonly players = inject(PlayerService);

  /** Route parameter `:tag` (bound automatically by the router, already decoded). */
  readonly tag = input.required<string>();

  protected readonly icons = GAME_ICONS;

  protected readonly profileResource = rxResource({
    params: () => this.tag(),
    stream: ({ params }) => this.players.getPlayerProfile(params),
  });
  protected readonly statsResource = rxResource({
    params: () => this.tag(),
    stream: ({ params }) => this.players.getPlayerStats(params),
  });

  protected readonly profile = computed(() => (this.profileResource.hasValue() ? this.profileResource.value() : null));
  protected readonly stats = computed(() => (this.statsResource.hasValue() ? this.statsResource.value() : null));

  /** Army grouped like the game's army overview; empty groups are hidden. */
  protected readonly army = computed<ArmySection[]>(() => {
    const p = this.profile();
    if (!p) return [];
    const sections: ArmySection[] = [
      { title: 'player.troops', units: p.troops },
      { title: 'player.superTroops', units: p.superTroops },
      { title: 'player.siegeMachines', units: p.siegeMachines },
      { title: 'player.pets', units: p.pets },
      { title: 'player.spells', units: p.spells },
      { title: 'player.heroEquipment', units: p.heroEquipment },
      { title: 'player.builderHeroes', units: p.builderBaseHeroes },
      { title: 'player.builderTroops', units: p.builderBaseTroops },
    ];
    return sections.filter((s) => s.units.length > 0);
  });

  /** Share of maxed units, per section. */
  protected maxedCount(units: PlayerUnit[]): number {
    return units.filter((u) => u.level >= u.maxLevel).length;
  }

  protected readonly achievementsDone = computed(
    () => this.profile()?.achievements.filter((a) => a.stars >= 3).length ?? 0,
  );
  /** Incomplete achievements first, then the completed ones. */
  protected readonly achievements = computed(() =>
    [...(this.profile()?.achievements ?? [])].sort((a, b) => Number(a.stars >= 3) - Number(b.stars >= 3)),
  );

  protected readonly starSlots = [0, 1, 2];

  protected percent(value: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  }
}
