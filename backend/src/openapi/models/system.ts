import { z } from 'zod';
import { dateTime, model, nullableDateTime, SyncError } from './common';

/** Last success and failure of a step of the synchronisation. */
const JOB = z
  .strictObject({
    lastSuccessAt: nullableDateTime('Last success; `null` since the server started without one.'),
    lastFailureAt: nullableDateTime('Last failure; `null` since the server started without one.'),
  });

export const Health = model(
  'Health',
  'Status of the service, its database and the war synchronisation. In production anonymous callers get `status` only; the other fields are for administrators (as for the API documentation).',
  z.strictObject({
    status: z.enum(['ok', 'degraded']).describe('`degraded` when `issues` is not empty.'),
    issues: z
      .array(z.enum(['databaseDown', 'warSyncStale', 'cocAccessDenied']))
      .describe(
        'What is wrong: MongoDB unreachable; war sync without success for twice its interval (built-in scheduler only); Clash of Clans API key refused (`accessDenied*`).',
      )
      .optional(),
    database: z.enum(['up', 'down']).describe('MongoDB connection.').optional(),
    warSync: z
      .strictObject({
        scheduler: z.enum(['running', 'stopped']).describe('Built-in scheduler (stopped when disabled or not configured).'),
        lastRunAt: nullableDateTime('Last run; `null` before the first one.'),
        lastSuccessAt: nullableDateTime('Last successful run; `null` before the first one.'),
        currentState: z
          .string()
          .nullable()
          .describe('State of `currentwar` at the last run (`notInWar` also covers the CWL days).'),
        nextRunAt: nullableDateTime('Next run of the scheduler.'),
        lastError: z
          .strictObject({
            status: z.number().int().describe('HTTP status of the Clash of Clans API.'),
            reason: z.string().describe("Supercell's reason, e.g. `accessDenied.invalidIp` (no secrets)."),
          })
          .nullable()
          .describe('Error of the last run; `null` when it succeeded.'),
      })
      .describe('War synchronisation.')
      .optional(),
    jobs: z
      .strictObject({
        warSync: JOB.describe('Regular war of the main clan.'),
        cwl: JOB.describe('Clan War League of every clan.'),
        raids: JOB.describe('Raid Weekends of every clan.'),
        donations: JOB.describe('Members and their donations.'),
        commendations: JOB.describe('Commendations of the closed periods.'),
        profiles: JOB.describe('Heroes and equipment of the members.'),
      })
      .describe('Last success and failure of each step of the synchronisation, since the server started.')
      .optional(),
    time: dateTime('Server time.').optional(),
  }),
);

export const WarSyncReport = model(
  'WarSyncReport',
  'Outcome of a run of the war synchronisation (Clan War League, Raid Weekends, records and commendations run after it).',
  z.strictObject({
    ranAt: dateTime('Start of the run.'),
    currentState: z.string().nullable().describe('State of `currentwar`; `notInWar` also covers the CWL days.'),
    warKey: z.string().nullable().describe('War saved from `currentwar`, if any.'),
    outcome: z
      .enum(['created', 'updated', 'unchanged'])
      .nullable()
      .describe('What happened to that war; `unchanged` when the saved war was already in a later state.'),
    finalized: z.array(z.string()).describe('Wars closed from their last snapshot because they were never seen ended.'),
    warLogMatched: z.array(z.string()).describe('Ended wars checked against the war log in this run.'),
    nextCheckAt: nullableDateTime('Earliest moment worth reading again (shortly after the end of the current war).'),
    error: SyncError.nullable().describe('Clash of Clans API error; `null` when the run succeeded.'),
  }),
);
