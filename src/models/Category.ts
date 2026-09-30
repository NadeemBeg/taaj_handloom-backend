import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Reusable {url, publicId} image sub-document (publicId used to delete from Cloudinary). */
export const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String },
    alt: { type: String },
  },
  { _id: false },
);

/**
 * Product category. Subcategories are modeled as self-referential documents
 * via `parent` — no separate collection needed.
 */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    description: { type: String, default: '' },
    image: { type: imageSchema },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    seo: {
      title: { type: String },
      description: { type: String },
    },
  },
  { timestamps: true },
);

categorySchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type CategoryDoc = HydratedDocument<InferSchemaType<typeof categorySchema>>;

export const Category = model('Category', categorySchema);
