import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import {
  BaseProposal,
  BaseProposalList,
  BaseResult,
  BaseStatus,
  DefenseBase,
  DefenseBaseChanges,
  DefenseBasePage,
} from './backend-api.types';

export type BaseImageVariant = 'thumb' | 'full';

/** Fields of a new base: link and screenshot required. */
export type NewDefenseBase = Required<Pick<DefenseBaseChanges, 'layoutUrl' | 'image'>> &
  DefenseBaseChanges;

/**
 * Arsenal of defense bases: read by the members of the clans, changed by administrators. Members
 * propose bases, which reach the arsenal once an administrator approves them (moderation).
 * Implementations: {@link HttpDefenseBasesService} (backend) and `MockDefenseBasesService` (demo
 * without backend), chosen by `provideCocApi`.
 */
export abstract class DefenseBasesService {
  /**
   * A page of bases, optionally of one town hall level only: the first page without `cursor`, the
   * following ones with the `nextCursor` of the previous page.
   */
  abstract list(townHallLevel: number | null, cursor?: string | null): Observable<DefenseBasePage>;
  abstract create(changes: NewDefenseBase): Observable<DefenseBase>;
  /** Changes only the fields given. */
  abstract update(id: string, changes: DefenseBaseChanges): Observable<DefenseBase>;
  abstract remove(id: string): Observable<void>;
  /** URL of the screenshot of a base (thumbnail for lists, full size for the enlarged view). */
  abstract imageUrl(base: DefenseBase, variant: BaseImageVariant): string;

  // --- Proposals of the members ---

  /** Proposes a base: it waits for an administrator's approval before reaching the arsenal. */
  abstract propose(changes: NewDefenseBase): Observable<BaseProposal>;
  /** The caller's proposals not approved yet (waiting or rejected). */
  abstract myProposals(): Observable<BaseProposal[]>;
  /** Changes a proposal of the caller; a rejected one is sent again for review. */
  abstract updateProposal(id: string, changes: DefenseBaseChanges): Observable<BaseProposal>;
  /** Withdraws a proposal of the caller not approved yet. */
  abstract withdrawProposal(id: string): Observable<void>;

  // --- Moderation (administrators) ---

  /** The proposals in one state, with the count of each state. */
  abstract proposals(status: BaseStatus): Observable<BaseProposalList>;
  /** Publishes a waiting proposal in the arsenal. */
  abstract approve(id: string): Observable<BaseProposal>;
  /** Refuses a waiting proposal; the reason is shown to its author. */
  abstract reject(id: string, reason: string): Observable<BaseProposal>;
}

@Injectable()
export class HttpDefenseBasesService extends DefenseBasesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).backendBaseUrl;
  private readonly url = `${this.baseUrl}/bases`;
  private readonly proposalsUrl = `${this.baseUrl}/base-proposals`;

  list(townHallLevel: number | null, cursor?: string | null): Observable<DefenseBasePage> {
    const params: Record<string, number | string> = {};
    if (townHallLevel) params['th'] = townHallLevel;
    if (cursor) params['cursor'] = cursor;
    // Not in the HTTP cache: `BaseArsenal` keeps the pages already read, per filter.
    return this.http
      .get<BaseResult<DefenseBasePage>>(this.url, { params, context: noCache() })
      .pipe(map((response) => response.result!));
  }

  create(changes: NewDefenseBase): Observable<DefenseBase> {
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

  propose(changes: NewDefenseBase): Observable<BaseProposal> {
    return this.http
      .post<BaseResult<BaseProposal>>(this.proposalsUrl, toFormData(changes))
      .pipe(map((response) => response.result!));
  }

  myProposals(): Observable<BaseProposal[]> {
    return this.http
      .get<BaseResult<BaseProposal[]>>(`${this.proposalsUrl}/mine`, { context: noCache() })
      .pipe(map((response) => response.result ?? []));
  }

  updateProposal(id: string, changes: DefenseBaseChanges): Observable<BaseProposal> {
    return this.http
      .patch<BaseResult<BaseProposal>>(
        `${this.proposalsUrl}/${encodeURIComponent(id)}`,
        toFormData(changes),
      )
      .pipe(map((response) => response.result!));
  }

  withdrawProposal(id: string): Observable<void> {
    return this.http
      .delete<BaseResult<null>>(`${this.proposalsUrl}/${encodeURIComponent(id)}`)
      .pipe(map(() => undefined));
  }

  proposals(status: BaseStatus): Observable<BaseProposalList> {
    return this.http
      .get<BaseResult<BaseProposalList>>(this.proposalsUrl, {
        params: { status },
        context: noCache(),
      })
      .pipe(map((response) => response.result!));
  }

  approve(id: string): Observable<BaseProposal> {
    return this.http
      .post<BaseResult<BaseProposal>>(
        `${this.proposalsUrl}/${encodeURIComponent(id)}/approve`,
        null,
      )
      .pipe(map((response) => response.result!));
  }

  reject(id: string, reason: string): Observable<BaseProposal> {
    return this.http
      .post<BaseResult<BaseProposal>>(`${this.proposalsUrl}/${encodeURIComponent(id)}/reject`, {
        reason,
      })
      .pipe(map((response) => response.result!));
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
