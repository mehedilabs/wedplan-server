
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

const connectDB = async () => {
  try {
    await client.connect();

    const db = client.db(process.env.DB_NAME);

    console.log("MongoDB connected successfully!");

    app.get("/", (req, res) => {
      res.send("WedPlan Server is running!");
    });

    app.listen(PORT, () => {
      console.log(`WedPlan server is running on port ${PORT}`);
    });
  } catch (error) {
    console.log("MongoDB connection failed:", error);
  }
};

connectDB();
