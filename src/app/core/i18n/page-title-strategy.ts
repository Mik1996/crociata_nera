import { DestroyRef, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

/** Texts of the search results when a route has none (`seo.<page>.title` / `.description`). */
const DEFAULT_SEO = 'seo.home';

/**
 * Sets the document title as "<Page> · Crociata Nera" and the meta description.
 * The route `title` is a translation key. A public page meant for search engines also sets
 * `data: { seo: 'seo.<page>' }`: its `title` replaces the whole document title and its
 * `description` becomes the meta description (the other pages get the home page's one).
 * Both are rewritten when the language changes.
 */
@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly translate = inject(TranslateService);
  private key: string | undefined;
  private seo: string | undefined;

  constructor() {
    super();
    const sub = this.translate.onLangChange.subscribe(() => this.apply());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.seo = seoKey(snapshot.root);
    this.apply();
  }

  private apply(): void {
    const page = this.key ? (this.translate.instant(this.key) as string) : '';
    this.title.setTitle(
      this.seo
        ? (this.translate.instant(`${this.seo}.title`) as string)
        : page
          ? `${page} · Crociata Nera`
          : 'Crociata Nera',
    );
    const description = this.translate.instant(`${this.seo ?? DEFAULT_SEO}.description`) as string;
    this.meta.updateTag({ name: 'description', content: description });
  }
}

/** `data.seo` of the deepest active route. */
function seoKey(route: ActivatedRouteSnapshot): string | undefined {
  let current: ActivatedRouteSnapshot | null = route;
  let key: string | undefined;
  while (current) {
    key = (current.data['seo'] as string | undefined) ?? key;
    current = current.firstChild;
  }
  return key;
}
