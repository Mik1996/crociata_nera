// Local war archive: the official API only exposes attack details for the current war,
// so we save the latest snapshot of every war to build the history.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Stable war id: preparation start + opponent tag (same as the frontend). */
export function warId(war) {
  const date = (war.preparationStartTime ?? '').slice(0, 15);
  const opponent = (war.opponent?.tag ?? '').replace('#', '');
  return `${date}-${opponent}`;
}

/** A `currentwar` response is worth archiving only if there is a war with members. */
export function isArchivable(war) {
  return (
    !!war &&
    (war.state === 'inWar' || war.state === 'warEnded') &&
    !!war.preparationStartTime &&
    !!war.opponent?.tag &&
    Array.isArray(war.clan?.members)
  );
}

export class WarArchive {
  /** @param {string} file path of the JSON file */
  constructor(file) {
    this.file = file;
    /** @type {Map<string, object> | null} */
    this.wars = null;
    this.writing = Promise.resolve();
  }

  async load() {
    if (this.wars) return this.wars;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.wars = new Map(Object.entries(data));
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[archive] unreadable file, starting from scratch: ${err.message}`);
      this.wars = new Map();
    }
    return this.wars;
  }

  /**
   * Saves or updates a war snapshot.
   * A `warEnded` snapshot is final and is no longer overwritten by earlier states.
   * @returns {Promise<boolean>} true if the archive changed
   */
  async save(war) {
    if (!isArchivable(war)) return false;
    const wars = await this.load();
    const id = warId(war);
    const existing = wars.get(id);
    if (existing?.state === 'warEnded' && war.state !== 'warEnded') return false;
    if (existing && JSON.stringify(existing) === JSON.stringify(war)) return false;
    wars.set(id, war);
    await this.persist();
    return true;
  }

  /** Archived snapshots, most recent first. */
  async list() {
    const wars = await this.load();
    return [...wars.values()].sort((a, b) => (b.endTime ?? '').localeCompare(a.endTime ?? ''));
  }

  persist() {
    // Serialised, atomic writes (temporary file + rename).
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(Object.fromEntries(this.wars), null, 2));
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}
