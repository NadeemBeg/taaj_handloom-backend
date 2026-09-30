import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { INVENTORY_REASONS } from '@taaj/shared';

/**
 * Append-only stock audit log. Every change to a product/variant stock level
 * writes one immutable row here — this IS the inventory history. Stock levels
 * themselves live on Product.baseStock / ProductVariant.stock.
 */
const inventoryTransactionSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null, index: true },

    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    change: { type: Number, required: true }, // signed delta (newStock - previousStock)

    reason: { type: String, enum: INVENTORY_REASONS, required: true, index: true },
    note: { type: String, default: '' },

    performedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inventoryTransactionSchema.index({ createdAt: -1 });

export type InventoryTransactionDoc = HydratedDocument<
  InferSchemaType<typeof inventoryTransactionSchema>
>;

export const InventoryTransaction = model('InventoryTransaction', inventoryTransactionSchema);
