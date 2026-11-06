import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { CocWar } from '../api/coc-api.types';
import { AuthService } from './auth.service';

const SAVABLE_STATES = new Set<CocWar['state']>(['preparation', 'inWar', 'warEnded']);

/** localStorage key of the ended wars already saved (they never change again). */
export const SYNCED_WARS_STORAGE_KEY = 'crociata-nera.synced-wars';
const MAX_REMEMBERED_WARS = 500;

/**
 * Automatic saving of wars to the backend.
 *
 * The Clash of Clans data layer hands every war it receives to {@link submit}; nothing
 * changes in how the frontend reads the API. A war is sent only when a user is signed in
 * and only if it changed since the last send. Wars received while signed out are kept
 * and sent as soon as the user signs in. Ended wars already saved are remembered across
 * visits, so the archive is not re-sent on every page load. Failures never affect the UI.
 */
@Injectable({ providedIn: 'root' })
export class WarSyncService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/wars`;

  /** Latest snapshot per war, waiting to be sent. */
  private readonly pending = new Map<string, CocWar>();
  /** Fingerprint of the last snapshot sent (or being sent) per war. */
  private readonly sent = new Map<string, string>();
  /** Ended wars saved successfully (persisted). */
  private readonly saved = new Set<string>(readSavedWars());

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) this.flush();
    });
  }

  submit(war: CocWar | null | undefined): void {
    const key = war && warKey(war);
    if (!war || !key || this.saved.has(key) || this.sent.get(key) === fingerprint(war)) return;
    this.pending.set(key, war);
    if (this.auth.isAuthenticated()) this.flush();
  }

  private flush(): void {
    for (const [key, war] of this.pending) {
      this.pending.delete(key);
      const print = fingerprint(war);
      if (this.sent.get(key) === print) continue;
      this.sent.set(key, print);
      this.http.post(this.url, war).subscribe({
        next: () => {
          if (war.state === 'warEnded') this.remember(key);
        },
        error: () => {
          // Allow a retry the next time the war is received.
          if (this.sent.get(key) === print) this.sent.delete(key);
        },
      });
    }
  }

  private remember(key: string): void {
    this.saved.add(key);
    try {
      localStorage.setItem(SYNCED_WARS_STORAGE_KEY, JSON.stringify([...this.saved].slice(-MAX_REMEMBERED_WARS)));
    } catch {
      // Storage unavailable (private mode, quota): the war may simply be sent again later.
    }
  }
}

function readSavedWars(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SYNCED_WARS_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Same id as the proxy archive and the backend: preparation start + opponent tag. */
export function warKey(war: CocWar): string | null {
  if (!SAVABLE_STATES.has(war.state) || !war.preparationStartTime || !war.opponent?.tag || !war.clan) return null;
  return `${war.preparationStartTime.slice(0, 15)}-${war.opponent.tag.replace('#', '')}`;
}

/** What changes during a war: state, scores and every attack. */
function fingerprint(war: CocWar): string {
  const side = (s: CocWar['clan']) =>
    [s?.stars, s?.destructionPercentage, s?.attacks, s?.members?.reduce((n, m) => n + (m.attacks?.length ?? 0), 0)].join(',');
  return `${war.state}|${side(war.clan)}|${side(war.opponent)}`;
}
