import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/** Most bases the arsenal can hold: keeps the images well within the free MongoDB cluster. */
export const MAX_DEFENSE_BASES = 400;
/** Longest description (e.g. the clan castle troops recommended for the base). */
export const MAX_DESCRIPTION_LENGTH = 1000;

/** A defense base of the arsenal: in-game "copy base" link, screenshot and notes. */
const defenseBaseSchema = new Schema(
  {
    /** From the layout link (`TH18:HV:…`). */
    townHallLevel: { type: Number, required: true, min: 1 },
    /** Decoded layout id: the same base cannot be added twice. */
    layoutId: { type: String, required: true, unique: true },
    layoutUrl: { type: String, required: true },
    description: { type: String, default: '' },
    /**
     * Random key of the screenshot in the image store. A new image gets a new key, so its URLs
     * can be cached forever; being random, the URLs cannot be guessed.
     */
    imageKey: { type: String, required: true },
    /** Size of the full image (the thumbnail has the same proportions). */
    imageWidth: { type: Number, required: true },
    imageHeight: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'DefenseBases', timestamps: true, versionKey: false },
);
defenseBaseSchema.index({ townHallLevel: -1, updatedAt: -1 });

export type DefenseBase = InferSchemaType<typeof defenseBaseSchema>;
export type DefenseBaseDocument = HydratedDocument<DefenseBase>;

export const DefenseBaseModel: Model<DefenseBase> =
  (models.DefenseBase as Model<DefenseBase>) ?? model('DefenseBase', defenseBaseSchema);

/** Public shape of a base; the image URLs are `/base-images/{image.key}/thumb|full`. */
export interface PublicDefenseBase {
  id: string;
  townHallLevel: number;
  layoutUrl: string;
  description: string;
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
    image: { key: base.imageKey, width: base.imageWidth, height: base.imageHeight },
    createdAt: base.createdAt.toISOString(),
    updatedAt: base.updatedAt.toISOString(),
  };
}
