import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/nextgen-erp";

if (!uri) throw new Error("MONGODB_URI is not set");

// Re-use the client across hot-reloads in dev
const globalForMongo = globalThis as typeof globalThis & {
  _mongoClient?: MongoClient;
  _mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClient = new MongoClient(uri);
    globalForMongo._mongoClientPromise = globalForMongo._mongoClient.connect();
  }
  clientPromise = globalForMongo._mongoClientPromise!;
} else {
  const client = new MongoClient(uri);
  clientPromise = client.connect();
}

export default clientPromise;
