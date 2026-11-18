
import { MongoClient, Db } from "mongodb";

let db: Db;

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri || !dbName) {
    throw new Error("MongoDB environment variables are missing");
  }

  const client = new MongoClient(uri);

  await client.connect();

  db = client.db(dbName);

  console.log("MongoDB connected successfully!");
};

export { connectDB, db };
