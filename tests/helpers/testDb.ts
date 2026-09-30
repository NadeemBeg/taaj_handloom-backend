import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';

let mongo: MongoMemoryServer;

/** Spin up an in-memory MongoDB and connect the app's mongoose instance to it. */
export async function startTestDb(): Promise<void> {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
}

export async function stopTestDb(): Promise<void> {
  await disconnectDatabase();
  await mongo?.stop();
}

/** Remove all documents between tests for isolation. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
