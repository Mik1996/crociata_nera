import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { cacheFor } from '../http/http-cache';
import { BaseResult, DefenseBase, DefenseBaseChanges, DefenseBaseList } from './backend-api.types';

export type BaseImageVariant = 'thumb' | 'full';

/**
 * Arsenal of defense bases: read by the members of the clans, changed by administrators.
 * Implementations: {@link HttpDefenseBasesService} (backend) and `MockDefenseBasesService` (demo
 * without backend), chosen by `provideCocApi`.
 */
export abstract class DefenseBasesService {
  /** The bases, optionally of one town hall level only. */
  abstract list(townHallLevel: number | null): Observable<DefenseBaseList>;
  abstract create(changes: Required<Pick<DefenseBaseChanges, 'layoutUrl' | 'image'>> & DefenseBaseChanges): Observable<DefenseBase>;
  /** Changes only the fields given. */
  abstract update(id: string, changes: DefenseBaseChanges): Observable<DefenseBase>;
  abstract remove(id: string): Observable<void>;
  /** URL of the screenshot of a base (thumbnail for lists, full size for the enlarged view). */
  abstract imageUrl(base: DefenseBase, variant: BaseImageVariant): string;
}

@Injectable()
export class HttpDefenseBasesService extends DefenseBasesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).backendBaseUrl;
  private readonly url = `${this.baseUrl}/bases`;

  list(townHallLevel: number | null): Observable<DefenseBaseList> {
    const params: Record<string, number> = townHallLevel ? { th: townHallLevel } : {};
    // Changes made here clear the cache (mutations on /api/v1); changes by others show up within minutes.
    return this.http
      .get<BaseResult<DefenseBaseList>>(this.url, { params, context: cacheFor({ minutes: 2 }) })
      .pipe(map((response) => response.result!));
  }

  create(changes: Required<Pick<DefenseBaseChanges, 'layoutUrl' | 'image'>> & DefenseBaseChanges): Observable<DefenseBase> {
    return this.http
      .post<BaseResult<DefenseBase>>(this.url, toFormData(changes))
      .pipe(map((response) => response.result!));
  }

  update(id: string, changes: DefenseBaseChanges): Observable<DefenseBase> {
    return this.http
      .patch<BaseResult<DefenseBase>>(`${this.url}/${encodeURIComponent(id)}`, toFormData(changes))
      .pipe(map((response) => response.result!));
  }

  remove(id: string): Observable<void> {
    return this.http
      .delete<BaseResult<null>>(`${this.url}/${encodeURIComponent(id)}`)
      .pipe(map(() => undefined));
  }

  imageUrl(base: DefenseBase, variant: BaseImageVariant): string {
    return `${this.baseUrl}/base-images/${encodeURIComponent(base.image.key)}/${variant}`;
  }
}

/**
 * `multipart/form-data` body: the backend reads `layoutUrl`, `description`, `clanCastleTroops` (JSON)
 * and the file `image`.
 */
function toFormData(changes: DefenseBaseChanges): FormData {
  const form = new FormData();
  if (changes.layoutUrl !== undefined) form.append('layoutUrl', changes.layoutUrl);
  if (changes.description !== undefined) form.append('description', changes.description);
  if (changes.clanCastleTroops !== undefined) {
    form.append('clanCastleTroops', JSON.stringify(changes.clanCastleTroops));
  }
  if (changes.image) form.append('image', changes.image, 'base');
  return form;
}
