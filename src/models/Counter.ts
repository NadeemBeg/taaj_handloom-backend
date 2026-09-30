import { Schema, model } from 'mongoose';

/** Atomic sequence counter (used for human-readable order numbers). */
const counterSchema = new Schema({
  _id: { type: String, required: true }, // e.g. "order-202608"
  seq: { type: Number, default: 0 },
});

export const Counter = model('Counter', counterSchema);

/** Atomically increment and return the next value for a key. */
export async function nextSequence(key: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return doc.seq;
}
