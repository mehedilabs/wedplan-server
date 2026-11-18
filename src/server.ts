
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Connect MongoDB before handling requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.log("MongoDB connection failed:", error);
    res.status(500).send("Database connection failed");
  }
});

app.get("/", (req, res) => {
  res.send("WedPlan Server is running!");
});

// Local development server
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`WedPlan server is running on port ${PORT}`);
  });
}

export default app;
