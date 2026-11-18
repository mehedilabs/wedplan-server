
import dotenv from "dotenv";
import { MongoClient, Db } from "mongodb";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

if (!uri || !dbName) {
  throw new Error("MongoDB environment variables are missing");
}

const client = new MongoClient(uri);

let db: Db;
let isConnected = false;

const connectDB = async (): Promise<void> => {
  if (isConnected) {
    return;
  }

  await client.connect();

  db = client.db(dbName);
  isConnected = true;

  console.log("MongoDB connected successfully!");
};

export { connectDB, db };
