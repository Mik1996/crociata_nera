import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconName } from './icon-names';

/** Folder of the icon files, relative to the base href (`public/assets/icons/`). */
export const ICONS_PATH = 'assets/icons/';

/**
 * SVG icon from `public/assets/icons/<name>.svg`, drawn with `<use>` so it stays inline SVG: the
 * files paint with `currentColor`, so the colour follows the text (`color` in the stylesheets),
 * and the size follows `font-size` (1em, 1.5rem by default), like the old Material icon font.
 * The service worker precaches the files, so icons show up offline too. Decorative unless
 * `label` is given.
 *
 * Carries the `mat-icon` class, so Material buttons, lists and form fields lay it out as their own.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'app-icon mat-icon notranslate',
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[attr.data-icon]': 'name()',
  },
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
})
export class Icon {
  readonly name = input.required<IconName>();
  /** Accessible name; without it the icon is hidden from assistive technologies. */
  readonly label = input<string | null>();

  /** `#icon` is the id of the root `<svg>` of every file (scripts/generate-icons.mjs). */
  protected readonly href = computed(() => `${ICONS_PATH}${this.name()}.svg#icon`);
}
