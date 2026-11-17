/**
 * Short-lived memory of Clash of Clans API responses read on a page request (member list, current
 * war, war log): the tables of a page ask for new rows at every filter or sort change, and the API
 * must not be called each time. A failed read is not kept: the next request tries again.
 */
const entries = new Map<string, { value: Promise<unknown>; expiresAt: number }>();

export function cachedRead<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const entry = entries.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.value as Promise<T>;
  const value = read();
  entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

/** Forgets every response (tests). */
export function resetLiveCache(): void {
  entries.clear();
}
