import { DestroyRef, inject, Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';

/** Angular Material paginator labels, translated and updated on language change. */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  private readonly translate = inject(TranslateService);

  constructor() {
    super();
    this.refresh();
    const sub = this.translate.onLangChange.subscribe(() => this.refresh());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0) return this.translate.instant('paginator.range', { start: 0, end: 0, total: 0 });
    const start = page * pageSize;
    const end = Math.min(start + pageSize, length);
    return this.translate.instant('paginator.range', { start: start + 1, end, total: length });
  };

  private refresh(): void {
    const t = (key: string) => this.translate.instant(`paginator.${key}`) as string;
    this.itemsPerPageLabel = t('itemsPerPage');
    this.nextPageLabel = t('next');
    this.previousPageLabel = t('previous');
    this.firstPageLabel = t('first');
    this.lastPageLabel = t('last');
    this.changes.next();
  }
}
