import { computed, Directive, input } from '@angular/core';

/** Look of a game button: `primary` is the theme's (iron/gold, green), `danger` is red. */
export type ButtonVariant = 'primary' | 'danger';

/**
 * Variant of a filled or outlined Material button: `<button mat-flat-button crnButton="danger">`.
 * The game look itself comes from the global styles (`styles.scss`); the variant only swaps its
 * colours (`--cn-button-*` tokens). A bare `crnButton` is the primary look.
 */
@Directive({
  selector: '[crnButton]',
  host: { '[class]': 'classes()' },
})
export class GameButton {
  readonly crnButton = input<ButtonVariant | ''>('');

  protected readonly variant = computed<ButtonVariant>(() => this.crnButton() || 'primary');
  protected readonly classes = computed(() => `cn-button cn-button--${this.variant()}`);
}
