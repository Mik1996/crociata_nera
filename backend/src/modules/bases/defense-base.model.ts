import { HydratedDocument, InferSchemaType, model, models, Model, QueryFilter, Schema } from 'mongoose';

/** Most bases the arsenal can hold: keeps the images well within the free MongoDB cluster. */
export const MAX_DEFENSE_BASES = 400;
/** Longest description (e.g. the clan castle troops recommended for the base). */
export const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Moderation state of a base. Bases added by administrators are `APPROVED` at once; bases proposed
 * by members start `PENDING` and only reach the arsenal once an administrator approves them.
 */
export enum BaseStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
export const BASE_STATUSES = Object.values(BaseStatus) as [BaseStatus, ...BaseStatus[]];

/** A defense base of the arsenal: in-game "copy base" link, screenshot and notes. */
const defenseBaseSchema = new Schema(
  {
    /** From the layout link (`TH18:HV:…`). */
    townHallLevel: { type: Number, required: true, min: 1 },
    /** Decoded layout id: the same base cannot be added twice. */
    layoutId: { type: String, required: true, unique: true },
    layoutUrl: { type: String, required: true },
    description: { type: String, default: '' },
    /** Clan castle reinforcements recommended for the base (within the castle's capacity). */
    clanCastleTroops: {
      type: [
        {
          _id: false,
          name: { type: String, required: true },
          count: { type: Number, required: true },
        },
      ],
      default: [],
    },
    /**
     * Random key of the screenshot in the image store. A new image gets a new key, so its URLs
     * can be cached forever; being random, the URLs cannot be guessed.
     */
    imageKey: { type: String, required: true },
    /** Size of the full image (the thumbnail has the same proportions). */
    imageWidth: { type: Number, required: true },
    imageHeight: { type: Number, required: true },
    /** Who added the base: the administrator, or the member who proposed it (the author). */
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * Only `APPROVED` bases are in the arsenal. Bases saved before moderation existed have no
     * status: they count as approved ({@link PUBLISHED_BASES}) and are marked so at startup
     * ({@link migrateBaseStatus}).
     */
    status: { type: String, enum: BASE_STATUSES, default: BaseStatus.APPROVED },
    /** When a proposal was sent, or sent again after a rejection; `null` for administrators' bases. */
    submittedAt: { type: Date, default: null },
    /** Administrator who approved or rejected the proposal, and when. */
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    /** Why the proposal was rejected (shown to its author); cleared when it is sent again. */
    rejectionReason: { type: String, default: null },
  },
  { collection: 'DefenseBases', timestamps: true, versionKey: false },
);
// Sort and keyset pagination of the arsenal (`listBases`).
defenseBaseSchema.index({ townHallLevel: -1, updatedAt: -1, _id: -1 });
// Moderation lists and the proposals of a member.
defenseBaseSchema.index({ status: 1, submittedAt: -1 });
defenseBaseSchema.index({ createdBy: 1, status: 1 });

export type DefenseBase = InferSchemaType<typeof defenseBaseSchema>;
export type DefenseBaseDocument = HydratedDocument<DefenseBase>;

export const DefenseBaseModel: Model<DefenseBase> =
  (models.DefenseBase as Model<DefenseBase>) ?? model('DefenseBase', defenseBaseSchema);

/**
 * The bases of the arsenal: approved ones, and those saved before moderation existed (no status
 * yet), so that they stay visible even before {@link migrateBaseStatus} has run.
 */
export const PUBLISHED_BASES: QueryFilter<DefenseBase> = {
  status: { $in: [BaseStatus.APPROVED, null] },
};

/**
 * Marks the bases saved before moderation existed (all added by administrators) as approved.
 * Idempotent: once done it changes nothing. Run at startup.
 */
export async function migrateBaseStatus(): Promise<void> {
  // On the collection, not the model: `updatedAt` stays as it is, so the bases keep their place in
  // the arsenal (sorted by last change).
  const { modifiedCount } = await DefenseBaseModel.collection.updateMany(
    { status: { $exists: false } },
    { $set: { status: BaseStatus.APPROVED } },
  );
  if (modifiedCount) console.log(`[migrations] ${modifiedCount} defense bases marked as approved`);
}

/** Public shape of a base; the image URLs are `/base-images/{image.key}/thumb|full`. */
export interface PublicDefenseBase {
  id: string;
  townHallLevel: number;
  layoutUrl: string;
  description: string;
  /** Clan castle reinforcements, by English troop name; empty when not given. */
  clanCastleTroops: { name: string; count: number }[];
  image: { key: string; width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

export function toPublicDefenseBase(base: DefenseBaseDocument): PublicDefenseBase {
  return {
    id: base._id.toString(),
    townHallLevel: base.townHallLevel,
    layoutUrl: base.layoutUrl,
    description: base.description,
    clanCastleTroops: base.clanCastleTroops.map(({ name, count }) => ({ name, count })),
    image: { key: base.imageKey, width: base.imageWidth, height: base.imageHeight },
    createdAt: base.createdAt.toISOString(),
    updatedAt: base.updatedAt.toISOString(),
  };
}
