import { InjectionToken } from '@angular/core';

/**
 * Application configuration.
 * Values come from the files in `src/environments/` and are injected through {@link APP_CONFIG}.
 * Do NOT put tokens or API keys here: the Clash of Clans API is reached only through the backend.
 */
export interface AppConfig {
  production: boolean;
  /** When true, uses local mock data instead of HTTP calls. */
  useMockApi: boolean;
  /**
   * Base URL of the application backend (`backend/`, Next.js): every datum of the site, Clash of
   * Clans data included (the backend reads the official API).
   * `/api/v1` in development is forwarded to `localhost:3001` by `proxy.conf.json`.
   */
  backendBaseUrl: string;
  /** Tag of the clan to monitor, including `#`. */
  clanTag: string;
  /** Displayed clan name. */
  clanName: string;
  /** Simulated latency of mock responses, in milliseconds. */
  mockLatencyMs: number;
  /** Number of past wars considered in player statistics. */
  statsWindow: number;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
