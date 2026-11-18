import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

/**
 * Page navigation (first/previous/next/last and rows per page) with the site's look and the texts of
 * `core/i18n/paginator-intl.ts`. Controlled: the parent keeps index and size and updates them on
 * `page`.
 */
@Component({
  selector: 'crn-paginator',
  imports: [MatPaginatorModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './paginator.html',
  styleUrl: './paginator.scss',
})
export class Paginator {
  /** Total number of items. */
  readonly length = input.required<number>();
  /** Current page, from 0. */
  readonly pageIndex = input(0);
  readonly pageSize = input.required<number>();
  /** Choices of rows per page (none: the size cannot be changed). */
  readonly pageSizeOptions = input<readonly number[]>([]);
  /** Accessible name of the navigation (e.g. which table it pages). */
  readonly label = input<string>();

  readonly page = output<PageEvent>();
}
