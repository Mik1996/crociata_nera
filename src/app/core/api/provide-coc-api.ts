import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CwlSelectionService, HttpCwlSelectionService } from '../backend/cwl-selection.service';
import { DefenseBasesService, HttpDefenseBasesService } from '../backend/defense-bases.service';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { MockCwlSelectionService } from '../mock/mock-cwl-selection.service';
import { MockDefenseBasesService } from '../mock/mock-defense-bases.service';
import { CocApiService } from './coc-api';
import { HttpCocApiService } from './http-coc-api.service';
import { MockCocApiService } from './mock-coc-api.service';

/** Registers the configuration and the data layer implementations (mock or HTTP). */
export function provideCocApi(config: AppConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: APP_CONFIG, useValue: config },
    { provide: CocApiService, useClass: config.useMockApi ? MockCocApiService : HttpCocApiService },
    {
      provide: DefenseBasesService,
      useClass: config.useMockApi ? MockDefenseBasesService : HttpDefenseBasesService,
    },
    {
      provide: CwlSelectionService,
      useClass: config.useMockApi ? MockCwlSelectionService : HttpCwlSelectionService,
    },
  ]);
}
