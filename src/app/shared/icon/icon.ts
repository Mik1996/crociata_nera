import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IconName, MATERIAL_ICONS } from './material-icons';

/**
 * SVG icon bundled with the app (no icon font, no network: it shows up offline too).
 * The colour follows the text (`currentColor`), the size follows `font-size` (1em, 1.5rem by
 * default), like the old Material icon font. Decorative unless `label` is given.
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

  private readonly sanitizer = inject(DomSanitizer);

  /** The icons are generated from a trusted package (scripts/generate-icons.mjs), never from input. */
  protected readonly body = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(MATERIAL_ICONS[this.name()] ?? ''),
  );
}
