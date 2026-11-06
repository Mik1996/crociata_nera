import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

let mongo: MongoMemoryServer | undefined;

/** One in-memory MongoDB for the whole run (the binary is downloaded on first use). */
export async function setup(project: TestProject): Promise<void> {
  mongo = await MongoMemoryServer.create();
  project.provide('databaseUrl', mongo.getUri('crociata-nera-test'));
}

export async function teardown(): Promise<void> {
  await mongo?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
