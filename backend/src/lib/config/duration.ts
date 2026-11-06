const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Converts `15m`, `12h`, `30d`… to seconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
