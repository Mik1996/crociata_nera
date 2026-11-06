import { InjectionToken } from '@angular/core';

/**
 * Application configuration.
 * Values come from the files in `src/environments/` and are injected through {@link APP_CONFIG}.
 * Do NOT put tokens or API keys here: the Clash of Clans API must be reached through a backend proxy.
 */
export interface AppConfig {
  production: boolean;
  /** When true, uses local mock data instead of HTTP calls. */
  useMockApi: boolean;
  /**
   * Base URL of the backend proxy that forwards requests to the official API
   * (e.g. `/api/coc` in development with the proxy, or `https://my-backend.example.com/coc`).
   */
  apiBaseUrl: string;
  /**
   * Base URL of the application backend (`backend/`, Next.js): authentication and saved wars.
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
