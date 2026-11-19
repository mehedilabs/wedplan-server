
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import serviceRoutes from "./routes/serviceRoutes";
import bookingRoutes from "./routes/bookingRoutes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB connection middleware
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.log("MongoDB connection failed:", error);
    res.status(500).send("Database connection failed");
  }
});

// Services routes
app.use("/services", serviceRoutes);

// Booking routes
app.use("/bookings", bookingRoutes);

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
