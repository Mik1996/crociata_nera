import { AppConfig } from '../app/core/config/app-config';

/**
 * Development configuration (`npm start`): real data through the local proxy (`npm run server`).
 * Requests to `/api/coc` are forwarded to the proxy by `proxy.conf.json`.
 * To work without a backend use `npm run start:mock`.
 */
export const environment: AppConfig = {
  production: false,
  useMockApi: false,
  apiBaseUrl: '/api/coc',
  backendBaseUrl: '/api/v1',
  clanTag: '#2J8JVVCLC',
  clanName: 'Crociata Nera',
  mockLatencyMs: 500,
  statsWindow: 20,
};
