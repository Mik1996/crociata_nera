// Start: npm run server  (same as: node --env-file=.env server/index.mjs)

import { fileURLToPath } from 'node:url';
import { createApp, saveWar } from './app.mjs';
import { WarArchive } from './archive.mjs';
import { CocClient } from './coc-client.mjs';
import { MonthlyHistory } from './history.mjs';

const token = process.env.COC_API_TOKEN;
const clanTag = process.env.COC_CLAN_TAG || '#2J8JVVCLC';
const port = Number(process.env.PORT ?? 3000);
const pollMinutes = Number(process.env.COC_POLL_MINUTES ?? 15);
const dataDir = fileURLToPath(new URL('./data/', import.meta.url));
const archiveFile = process.env.COC_ARCHIVE_FILE || `${dataDir}wars.json`;
const historyDir = process.env.COC_HISTORY_DIR || `${dataDir}history`;

if (!token) {
  console.error('COC_API_TOKEN is not set. Copy .env.example to .env and fill in the token.');
  process.exit(1);
}

const client = new CocClient({ token });
const archive = new WarArchive(archiveFile);
const history = new MonthlyHistory(historyDir);
const app = createApp({ client, archive, history, clanTag });

/** Periodically polls the current war: archives it and, once ended, adds it to the history. */
async function refreshArchive() {
  try {
    const war = await client.currentWar(clanTag);
    const { archived, recorded } = await saveWar(war, { archive, history });
    if (archived) console.log(`[archive] saved war against ${war.opponent?.name} (${war.state})`);
    if (recorded) console.log(`[history] war against ${war.opponent?.name} added to the monthly history`);
  } catch (err) {
    console.warn(`[archive] refresh failed: ${err.body?.reason ?? ''} ${err.message}`);
  }
}

/** On startup, moves ended wars already in the archive into the history. */
async function recoverFromArchive() {
  let recovered = 0;
  for (const war of await archive.list()) {
    if (await history.record(war).catch(() => false)) recovered++;
  }
  if (recovered > 0) console.log(`[history] recovered ${recovered} wars from the archive`);
}

app.listen(port, async () => {
  console.log(`Clash of Clans proxy listening on http://localhost:${port} for clan ${clanTag}`);
  await recoverFromArchive().catch((err) => console.warn(`[history] recovery failed: ${err.message}`));
  void refreshArchive();
  if (pollMinutes > 0) setInterval(refreshArchive, pollMinutes * 60_000).unref();
});
