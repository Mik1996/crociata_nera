#!/usr/bin/env node
// Copies the production database (`Prod`) onto the development one (`dev`), to bring dev back to
// the current state of the site. Prod is only read; dev is overwritten collection by collection
// (documents and indexes). Collections that exist only in dev are dropped, except the kept ones.
//
// Kept as they are in dev (never copied, never dropped):
// - the base arsenal (DefenseBases, BaseImages): dev keeps its own bases and screenshots;
// - Telegram (TelegramChats, TelegramBasePosts): dev's chats belong to the dev bot, prod's to the
//   production bot; copying them would point the dev bot at the real channels;
// - Users and Sessions: dev keeps its own accounts and sign-ins (the authors of dev's bases stay
//   linked); prod's emails, password hashes and refresh tokens never leave prod.
//
// Usage, from backend/ (reads DATABASE_URL of dev from .env.local):
//   node --env-file=.env.local scripts/copy-prod-to-dev.mjs            # plan only, nothing written
//   node --env-file=.env.local scripts/copy-prod-to-dev.mjs --apply    # copy
// The production URL is PROD_DATABASE_URL when set, otherwise DATABASE_URL with the database
// name `Prod` instead of `dev` (same Atlas cluster and user). Connection strings are never printed.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { MongoClient } = require('mongodb');

const SOURCE_DB = 'Prod';
const TARGET_DB = 'dev';
const KEEP_IN_DEV = new Set(['DefenseBases', 'BaseImages', 'TelegramChats', 'TelegramBasePosts', 'Users', 'Sessions']);
const BATCH = 500;

const apply = process.argv.includes('--apply');

/** Database name of a MongoDB URL (the path), without printing the URL. */
function databaseOf(url) {
  return new URL(url).pathname.replace(/^\//, '');
}

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) fail('DATABASE_URL is not set: run with --env-file=.env.local from backend/');
const sourceUrl = process.env.PROD_DATABASE_URL || withDatabase(targetUrl, SOURCE_DB);
if (databaseOf(targetUrl) !== TARGET_DB) fail(`the target must be the "${TARGET_DB}" database, it is "${databaseOf(targetUrl)}"`);
if (databaseOf(sourceUrl) !== SOURCE_DB) fail(`the source must be the "${SOURCE_DB}" database, it is "${databaseOf(sourceUrl)}"`);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const source = new MongoClient(sourceUrl, { readPreference: 'secondaryPreferred' });
const target = new MongoClient(targetUrl);

try {
  await Promise.all([source.connect(), target.connect()]);
  const sourceDb = source.db(SOURCE_DB);
  const targetDb = target.db(TARGET_DB);
  if (sourceDb.databaseName === targetDb.databaseName) fail('source and target are the same database');

  const list = async (db) =>
    (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith('system.'))
      .sort();
  const sourceNames = await list(sourceDb);
  const targetNames = await list(targetDb);
  const copy = sourceNames.filter((name) => !KEEP_IN_DEV.has(name));
  const drop = targetNames.filter((name) => !KEEP_IN_DEV.has(name) && !sourceNames.includes(name));

  console.log(`${apply ? 'Copying' : 'Plan (nothing written; add --apply to copy)'}: ${SOURCE_DB} → ${TARGET_DB}`);
  for (const name of copy) {
    const [from, to] = await Promise.all([
      sourceDb.collection(name).estimatedDocumentCount(),
      targetNames.includes(name) ? targetDb.collection(name).estimatedDocumentCount() : 0,
    ]);
    console.log(`  copy  ${name.padEnd(24)} ${String(from).padStart(7)} documents (dev has ${to})`);
  }
  for (const name of drop) console.log(`  drop  ${name.padEnd(24)} only in dev`);
  for (const name of [...KEEP_IN_DEV].sort()) console.log(`  keep  ${name.padEnd(24)} dev's own`);
  if (!apply) process.exit(0);

  for (const name of copy) {
    if (targetNames.includes(name)) await targetDb.collection(name).drop();
    const into = targetDb.collection(name);
    let batch = [];
    let copied = 0;
    for await (const doc of sourceDb.collection(name).find()) {
      batch.push(doc);
      if (batch.length === BATCH) {
        await into.insertMany(batch, { ordered: false });
        copied += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await into.insertMany(batch, { ordered: false });
      copied += batch.length;
    }
    if (!copied) await targetDb.createCollection(name);
    const indexes = (await sourceDb.collection(name).indexes()).filter((index) => index.name !== '_id_');
    if (indexes.length) {
      await into.createIndexes(
        indexes.map(({ v, ns, ...index }) => index),
      );
    }
    console.log(`  ✓ ${name}: ${copied} documents, ${indexes.length} indexes`);
  }
  for (const name of drop) {
    await targetDb.collection(name).drop();
    console.log(`  ✓ ${name}: dropped`);
  }
  console.log('Done. Restart the backend (npm run backend): it starts from the copied state.');
} finally {
  await Promise.allSettled([source.close(), target.close()]);
}
