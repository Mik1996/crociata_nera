import { ANNOUNCEMENT_KINDS, AnnouncementKind, AnnouncementSettingsModel } from './announcement.model';

const SETTINGS_KEY = 'kinds';

interface KindState {
  enabled: boolean;
  changedAt: Date;
}

export interface AnnouncementKindSetting {
  kind: AnnouncementKind;
  enabled: boolean;
}

export interface AnnouncementSettings {
  /** Every kind, in the order of `ANNOUNCEMENT_KINDS`. */
  kinds: AnnouncementKindSetting[];
}

/** Which kinds get drafts, and from when (`null`: always on, no start of their own). */
export interface KindGate {
  enabled(kind: AnnouncementKind): boolean;
  /** When the kind was last turned on: what happened before is not announced. */
  since(kind: AnnouncementKind): Date | null;
}

async function savedKinds(): Promise<Partial<Record<AnnouncementKind, KindState>>> {
  const doc = await AnnouncementSettingsModel.findOne({ key: SETTINGS_KEY }).lean();
  return (doc?.kinds as Partial<Record<AnnouncementKind, KindState>> | null) ?? {};
}

function toSettings(kinds: Partial<Record<AnnouncementKind, KindState>>): AnnouncementSettings {
  return { kinds: ANNOUNCEMENT_KINDS.map((kind) => ({ kind, enabled: kinds[kind]?.enabled ?? true })) };
}

export async function announcementSettings(): Promise<AnnouncementSettings> {
  return toSettings(await savedKinds());
}

/** Turns kinds on or off (the others stay as they are); a kind that changes gets a new `changedAt`. */
export async function updateAnnouncementSettings(
  changes: AnnouncementKindSetting[],
  now = new Date(),
): Promise<AnnouncementSettings> {
  const kinds = await savedKinds();
  const set: Record<string, KindState> = {};
  for (const { kind, enabled } of changes) {
    if ((kinds[kind]?.enabled ?? true) === enabled) continue;
    set[`kinds.${kind}`] = { enabled, changedAt: now };
    kinds[kind] = { enabled, changedAt: now };
  }
  if (Object.keys(set).length) {
    await AnnouncementSettingsModel.updateOne({ key: SETTINGS_KEY }, { $set: set }, { upsert: true });
  }
  return toSettings(kinds);
}

export async function kindGate(): Promise<KindGate> {
  const kinds = await savedKinds();
  return {
    enabled: (kind) => kinds[kind]?.enabled ?? true,
    since: (kind) => {
      const state = kinds[kind];
      return state?.enabled ? new Date(state.changedAt) : null;
    },
  };
}

/** The later of two starts (`null`: none). */
export function laterOf(a: Date, b: Date | null): Date {
  return b && b > a ? b : a;
}
