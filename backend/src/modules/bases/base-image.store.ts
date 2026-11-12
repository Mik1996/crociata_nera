import { InferSchemaType, model, models, Model, Schema } from 'mongoose';
import { IMAGE_CONTENT_TYPE, IMAGE_VARIANTS, ImageVariant, ProcessedImages } from './base-image';

/**
 * Images of the defense bases, one document per variant. They live in MongoDB with the rest of
 * the data (same backups); a base weighs about 200 KB, so the free cluster has room for hundreds.
 * Kept apart from `DefenseBases` so that listing the bases never loads image data.
 */
const baseImageSchema = new Schema(
  {
    key: { type: String, required: true },
    variant: { type: String, enum: IMAGE_VARIANTS, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { collection: 'BaseImages', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
baseImageSchema.index({ key: 1, variant: 1 }, { unique: true });

type BaseImage = InferSchemaType<typeof baseImageSchema>;

export const BaseImageModel: Model<BaseImage> =
  (models.BaseImage as Model<BaseImage>) ?? model('BaseImage', baseImageSchema);

export interface StoredImage {
  data: Buffer;
  contentType: string;
}

/**
 * Where the images of the bases are kept. Only this interface is used by the rest of the code, so
 * the images can move (disk, object storage) by swapping {@link imageStore}.
 */
export interface ImageStore {
  save(key: string, images: ProcessedImages): Promise<void>;
  read(key: string, variant: ImageVariant): Promise<StoredImage | null>;
  remove(key: string): Promise<void>;
}

const mongoImageStore: ImageStore = {
  async save(key, images) {
    await BaseImageModel.insertMany(
      IMAGE_VARIANTS.map((variant) => ({ key, variant, contentType: IMAGE_CONTENT_TYPE, ...images[variant] })),
    );
  },
  async read(key, variant) {
    // Not lean: a hydrated document gives the data as a Node Buffer.
    const image = await BaseImageModel.findOne({ key, variant }).select('data contentType');
    return image && { data: image.data, contentType: image.contentType };
  },
  async remove(key) {
    await BaseImageModel.deleteMany({ key });
  },
};

export const imageStore: ImageStore = mongoImageStore;
