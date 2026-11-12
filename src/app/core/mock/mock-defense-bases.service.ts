import { inject, Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DefenseBase, DefenseBaseChanges, DefenseBasePage } from '../backend/backend-api.types';
import { DefenseBasesService } from '../backend/defense-bases.service';
import { APP_CONFIG } from '../config/app-config';
import { TOWN_HALL_IMAGES } from '../game/game-assets';
import { ClanCastleTroop, clanCastleCapacity, housingSpaceUsed } from '../game/clan-castle';
import { layoutLinkTownHall } from '../game/layout-link';

const layoutLink = (th: number, id: string) =>
  `https://link.clashofclans.com/en?action=OpenLayout&id=TH${th}%3AHV%3A${id}`;

const SEED: [th: number, id: string, description: string, troops: ClanCastleTroop[]][] = [
  [
    18,
    'AAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd',
    'Anti 3 stelle da guerra.',
    [
      { name: 'Super Minion', count: 2 },
      { name: 'Witch', count: 2 },
      { name: 'Archer', count: 7 },
    ],
  ],
  [18, 'AAAAFQAAAAKx9TQkW7nN2fYbRk0pPq1Z', '', []],
  [
    17,
    'AAAAEQAAAAH2c1y3m4n5b6v7c8x9z0Lp',
    'Ibrida farming/guerra.',
    [
      { name: 'Electro Dragon', count: 1 },
      { name: 'Headhunter', count: 4 },
    ],
  ],
  [
    16,
    'AAAADwAAAAEyq8wPd9sLk3Jh4Gf5Ds6A',
    'Ideale per la CWL.',
    [
      { name: 'Lava Hound', count: 1 },
      { name: 'Valkyrie', count: 2 },
    ],
  ],
  [15, 'AAAADQAAAAG1h2j3k4l5z6x7c8v9b0Nm', '', []],
  // More bases without notes, enough for a few pages of the endless list.
  ...[18, 18, 18, 18, 17, 17, 17, 17, 17, 16, 16, 16, 15, 15, 14, 14, 13, 12].map(
    (th, i): [number, string, string, ClanCastleTroop[]] => [
      th,
      `MOCK${String(i).padStart(4, '0')}`,
      '',
      [],
    ],
  ),
];

/** Smaller pages than the backend's, so the demo shows the endless list with few bases. */
const MOCK_PAGE_SIZE = 8;

/**
 * Arsenal kept in memory, for the demo without backend (`npm run start:mock`). Town hall pictures
 * stand in for the screenshots; uploaded images are shown from the browser memory. Changes last
 * until the page is reloaded.
 */
@Injectable()
export class MockDefenseBasesService extends DefenseBasesService {
  private readonly latency = inject(APP_CONFIG).mockLatencyMs;
  private bases: DefenseBase[] = SEED.map(([th, id, description, clanCastleTroops], index) => {
    const date = new Date(Date.UTC(2026, 10, 10 - index)).toISOString();
    return {
      id: `mock-${index}`,
      townHallLevel: th,
      layoutUrl: layoutLink(th, id),
      description,
      clanCastleTroops,
      image: { key: TOWN_HALL_IMAGES[th], width: 1, height: 1 },
      createdAt: date,
      updatedAt: date,
    };
  });
  private nextId = SEED.length;

  /** The cursor is the id of the last base of the previous page. */
  list(townHallLevel: number | null, cursor?: string | null): Observable<DefenseBasePage> {
    const sorted = [...this.bases].sort(
      (a, b) =>
        b.townHallLevel - a.townHallLevel ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.id.localeCompare(a.id),
    );
    const matching = sorted.filter((b) => !townHallLevel || b.townHallLevel === townHallLevel);
    const start = cursor ? matching.findIndex((b) => b.id === cursor) + 1 : 0;
    const items = matching.slice(start, start + MOCK_PAGE_SIZE);
    return this.reply({
      items,
      nextCursor: start + MOCK_PAGE_SIZE < matching.length ? items.at(-1)!.id : null,
      townHallLevels: [...new Set(sorted.map((b) => b.townHallLevel))],
    });
  }

  create(
    changes: Required<Pick<DefenseBaseChanges, 'layoutUrl' | 'image'>> & DefenseBaseChanges,
  ): Observable<DefenseBase> {
    const now = new Date().toISOString();
    const base: DefenseBase = {
      id: `mock-${this.nextId++}`,
      townHallLevel: 0,
      layoutUrl: '',
      description: '',
      clanCastleTroops: [],
      image: { key: '', width: 1, height: 1 },
      createdAt: now,
      updatedAt: now,
    };
    const result = this.apply(base, changes);
    if (result instanceof HttpErrorResponse) return throwError(() => result);
    this.bases = [result, ...this.bases];
    return this.reply(result);
  }

  update(id: string, changes: DefenseBaseChanges): Observable<DefenseBase> {
    const base = this.bases.find((b) => b.id === id);
    if (!base) return throwError(() => error(404, 'ERROR.BASE_NOT_FOUND'));
    const result = this.apply({ ...base, updatedAt: new Date().toISOString() }, changes);
    if (result instanceof HttpErrorResponse) return throwError(() => result);
    this.bases = this.bases.map((b) => (b.id === id ? result : b));
    return this.reply(result);
  }

  remove(id: string): Observable<void> {
    this.bases = this.bases.filter((b) => b.id !== id);
    return this.reply(undefined);
  }

  /** Same picture for both variants. */
  imageUrl(base: DefenseBase): string {
    return base.image.key;
  }

  private apply(base: DefenseBase, changes: DefenseBaseChanges): DefenseBase | HttpErrorResponse {
    const next = { ...base };
    if (changes.layoutUrl !== undefined) {
      const th = layoutLinkTownHall(changes.layoutUrl);
      if (!th) return error(400, 'ERROR.LAYOUT_LINK_IS_NOT_VALID', 'layoutUrl');
      next.townHallLevel = th;
      next.layoutUrl = changes.layoutUrl.trim();
    }
    if (changes.description !== undefined) next.description = changes.description.trim();
    if (changes.clanCastleTroops !== undefined) next.clanCastleTroops = changes.clanCastleTroops;
    if (housingSpaceUsed(next.clanCastleTroops) > clanCastleCapacity(next.townHallLevel)) {
      return error(400, 'ERROR.CLAN_CASTLE_OVER_CAPACITY', 'clanCastleTroops');
    }
    if (changes.image)
      next.image = { key: URL.createObjectURL(changes.image), width: 1, height: 1 };
    return next;
  }

  private reply<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }
}

function error(status: number, key: string, field?: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { result: null, messages: [{ key, field }] } });
}
