import { AppConfig } from '../app/core/config/app-config';

/**
 * Production configuration (`npm run build`).
 * In production the proxy (`server/`) must be reachable on the same domain under `/api/coc`,
 * or set its full URL here.
 */
export const environment: AppConfig = {
  production: true,
  useMockApi: false,
  apiBaseUrl: '/api/coc',
  backendBaseUrl: '/api/v1',
  clanTag: '#2J8JVVCLC',
  clanName: 'Crociata Nera',
  mockLatencyMs: 300,
  statsWindow: 20,
};
