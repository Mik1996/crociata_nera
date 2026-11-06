import { DestroyRef, inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

/**
 * Sets the document title as "<Page> · Crociata Nera".
 * The route `title` is a translation key; the title is rewritten when the language changes.
 */
@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);
  private key: string | undefined;

  constructor() {
    super();
    const sub = this.translate.onLangChange.subscribe(() => this.apply());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.apply();
  }

  private apply(): void {
    const page = this.key ? (this.translate.instant(this.key) as string) : '';
    this.title.setTitle(page ? `${page} · Crociata Nera` : 'Crociata Nera');
  }
}
