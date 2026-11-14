import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Crusader, CrusaderPose } from '../crusader/crusader';

/**
 * Scenes behind a page header, taken from the acts of the welcome page:
 * - `dusk`: ruins at dusk (the default);
 * - `war`: battlefield in flames;
 * - `army`: the crusaders at sunset;
 * - `capital`: the sky above the clouds;
 * - `hall`: stone hall lit by torches;
 * - `candle`: candlelit room.
 */
export type PageScene = 'dusk' | 'war' | 'army' | 'capital' | 'hall' | 'candle';

/**
 * Scenic page header: a scene reaching the edges of the content area, with a kicker, the page
 * title in gold letters, a tagline and optional actions (projected content). A larger block can be
 * projected below the title with the `pageHero` attribute (e.g. the scoreboard of a battle).
 * The scenes are the same in every theme.
 */
@Component({
  selector: 'crn-page-header',
  imports: [Crusader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-scene]': 'scene()', '[class.page-header--flush]': 'flush()' },
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Short line above the title ("Cronache del fronte"). */
  readonly kicker = input<string>();
  readonly scene = input<PageScene>('dusk');
  /** Pose of the Black Crusader standing on the right of the scene (wide headers only). */
  readonly crusader = input<CrusaderPose>();
  /**
   * The header already reaches the edges of its container (e.g. inside a `.page__scroll--bleed`
   * area), so it does not undo the paddings of the content area.
   */
  readonly flush = input(false, { transform: booleanAttribute });
}
