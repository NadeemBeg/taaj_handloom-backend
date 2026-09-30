import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Append-only trail of privileged admin actions. Populated automatically by the
 * audit recorder middleware for every authenticated write (POST/PATCH/PUT/DELETE)
 * that completes successfully.
 */
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: { type: String },
    action: { type: String, required: true }, // HTTP method
    entity: { type: String, index: true }, // resource, e.g. "products"
    entityId: { type: String },
    path: { type: String },
    statusCode: { type: Number },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type AuditLogDoc = HydratedDocument<InferSchemaType<typeof auditLogSchema>>;

export const AuditLog = model('AuditLog', auditLogSchema);
