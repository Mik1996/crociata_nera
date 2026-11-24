import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  linkedSignal,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { DefenseBase } from '../../../core/backend/backend-api.types';
import { Icon } from '../../../shared/components/icon/icon';
import { ScrollFade } from '../../../shared/directives/scroll-fade';
import { ClanCastleTroops } from './clan-castle-troops';

export interface BaseImageDialogData {
  /** The bases browsed with the arrows, in the order of the page (it may grow while browsing). */
  bases: Signal<readonly DefenseBase[]>;
  /** Position of the base shown first. */
  index: number;
  /** Full-size screenshot of a base. */
  imageUrl: (base: DefenseBase) => string;
  /** Asks the page for more bases when the last ones are reached (endless lists). */
  loadMore?: () => void;
}

/**
 * Options of the dialog. Its size never changes while browsing: the picture has a box of fixed
 * proportions and the troops and notes one of fixed height.
 */
export const BASE_IMAGE_DIALOG = {
  width: '75rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'dialog',
} as const;

/** Horizontal distance (CSS pixels) a swipe must cover to change base. */
const SWIPE_DISTANCE = 48;
/** Movement (CSS pixels) after which a drag is known to be horizontal or vertical. */
const DRAG_SLOP = 8;
/** Longest wait for the end of a slide, if `transitionend` never comes. */
const SLIDE_TIMEOUT_MS = 400;

/**
 * Enlarged screenshot of a base, with its description and the "copy base" link. The arrows beside
 * the picture, the arrow keys and a horizontal swipe go to the previous or next base of the list;
 * the pictures slide (while swiping they follow the finger, the neighbour coming in beside them).
 */
@Component({
  selector: 'crn-base-image-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    Icon,
    TranslatePipe,
    ClanCastleTroops,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './base-image-dialog.html',
  styleUrl: './base-image-dialog.scss',
})
export class BaseImageDialog {
  private readonly data = inject<BaseImageDialogData>(MAT_DIALOG_DATA);
  private readonly bases = this.data.bases;
  private readonly destroyRef = inject(DestroyRef);

  /** Position of the base shown, kept inside the list if it shrinks. */
  protected readonly index = linkedSignal<number, number>({
    source: () => this.bases().length,
    computation: (length, previous) =>
      Math.max(0, Math.min(previous?.value ?? this.data.index, length - 1)),
  });
  protected readonly base = computed<DefenseBase | undefined>(() => this.bases()[this.index()]);
  protected readonly previousBase = computed<DefenseBase | undefined>(
    () => this.bases()[this.index() - 1],
  );
  protected readonly nextBase = computed<DefenseBase | undefined>(
    () => this.bases()[this.index() + 1],
  );
  protected readonly hasPrevious = computed(() => !!this.previousBase());
  protected readonly hasNext = computed(() => !!this.nextBase());

  /** Horizontal shift (CSS pixels) of the pictures: the drag, or the slide that ends it. */
  protected readonly offset = signal(0);
  /** The pictures are sliding (to the next base, or back in place). */
  protected readonly sliding = signal(false);

  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private drag: { id: number; x: number; y: number; horizontal: boolean | null } | null = null;
  private slideEnd: (() => void) | null = null;
  private slideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(MatDialogRef)
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === 'ArrowLeft') this.previous();
        else if (event.key === 'ArrowRight') this.next();
        else return;
        event.preventDefault();
      });

    // Near the end of the list, the page reads its next bases.
    effect(() => {
      if (this.index() >= this.bases().length - 2) untracked(() => this.data.loadMore?.());
    });
    this.destroyRef.onDestroy(() => clearTimeout(this.slideTimer));
  }

  protected imageOf(base: DefenseBase): string {
    return this.data.imageUrl(base);
  }

  /** Slides to the previous base (arrow button, arrow key); a slide under way ends at once. */
  protected previous(): void {
    this.finishSlide();
    if (this.hasPrevious()) this.slide(-1);
  }

  /** Slides to the next base (arrow button, arrow key); a slide under way ends at once. */
  protected next(): void {
    this.finishSlide();
    if (this.hasNext()) this.slide(1);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || this.sliding()) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: null };
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.horizontal === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP) return;
      drag.horizontal = Math.abs(dx) > Math.abs(dy);
      // The finger may leave the picture: its moves keep coming here.
      if (drag.horizontal) this.stage()?.nativeElement.setPointerCapture?.(event.pointerId);
    }
    if (!drag.horizontal) return;
    // Past the first or the last base the picture resists.
    const blocked = dx > 0 ? !this.hasPrevious() : !this.hasNext();
    this.offset.set(blocked ? dx / 4 : dx);
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    // Mostly horizontal: a vertical drag scrolls the dialog.
    const swiped = Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) >= Math.abs(dy) * 1.5;
    const step = !swiped ? 0 : dx < 0 ? (this.hasNext() ? 1 : 0) : this.hasPrevious() ? -1 : 0;
    this.slide(step);
  }

  protected onPointerCancel(): void {
    this.drag = null;
    this.slide(0);
  }

  protected onTransitionEnd(event: TransitionEvent): void {
    if (event.target === event.currentTarget && event.propertyName === 'transform') {
      this.finishSlide();
    }
  }

  /**
   * Slides the pictures by a whole base (`step` 1 next, -1 previous) or back in place (0), then
   * shows the base reached. At once without room to slide or with reduced motion.
   */
  private slide(step: number): void {
    const stage = this.stage()?.nativeElement;
    const neighbour = stage?.querySelector<HTMLElement>(
      step > 0 ? '.image--next' : '.image--previous',
    );
    const distance = step === 0 ? 0 : (neighbour?.offsetLeft ?? 0);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const end = () => {
      this.index.update((i) => i + step);
      this.offset.set(0);
      this.sliding.set(false);
    };
    if ((step !== 0 && !distance) || reduced || (step === 0 && this.offset() === 0)) {
      end();
      return;
    }
    this.slideEnd = end;
    this.sliding.set(true);
    this.offset.set(-step * Math.abs(distance));
    clearTimeout(this.slideTimer);
    this.slideTimer = setTimeout(() => this.finishSlide(), SLIDE_TIMEOUT_MS);
  }

  private finishSlide(): void {
    clearTimeout(this.slideTimer);
    const end = this.slideEnd;
    this.slideEnd = null;
    end?.();
  }
}
