import mongoose from 'mongoose';
import { env } from '../config/env';

interface MongooseCache {
  promise: Promise<typeof mongoose> | null;
}

// Route Handlers can be re-evaluated (hot reload, multiple bundles): keep a single
// connection per process on `globalThis`.
const globalCache = globalThis as typeof globalThis & { __mongoose?: MongooseCache };
const cache: MongooseCache = (globalCache.__mongoose ??= { promise: null });

/** Opens (once) and returns the shared MongoDB connection. */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env().DATABASE_URL, { serverSelectionTimeoutMS: 5_000 })
      .catch((error: unknown) => {
        // Allow a retry on the next request instead of caching the failure.
        cache.promise = null;
        throw error;
      });
  }
  return cache.promise;
}

/** `true` when the connection is open (used by the health check). */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
