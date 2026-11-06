import { AppConfig } from '../app/core/config/app-config';

/** Demo configuration with mock data, no backend (`npm run start:mock`). */
export const environment: AppConfig = {
  production: false,
  useMockApi: true,
  apiBaseUrl: '/api/coc',
  clanTag: '#2J8JVVCLC',
  clanName: 'Crociata Nera',
  mockLatencyMs: 500,
  statsWindow: 20,
};
