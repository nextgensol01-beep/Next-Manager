import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nextgen-erp";

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: Cached;
  mongoose?: Cached;
};

const cached: Cached = globalForMongoose.mongooseCache ||
  globalForMongoose.mongoose ||
  { conn: null, promise: null };

globalForMongoose.mongooseCache = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false });
  }
  const pending = cached.promise;
  try {
    cached.conn = await pending;
  } catch (error) {
    // A failed attempt must not poison this process or clear a newer retry.
    if (cached.promise === pending) cached.promise = null;
    throw error;
  }
  return cached.conn;
}
