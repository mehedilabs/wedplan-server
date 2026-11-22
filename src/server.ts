
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import serviceRoutes from "./routes/serviceRoutes";
import bookingRoutes from "./routes/bookingRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import adminRoutes from "./routes/adminRoutes";

dotenv.config();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "stripe-signature",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  }),
);

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

// Payment routes must come before express.json()
// so Stripe webhook can receive the raw request body.
app.use("/payments", paymentRoutes);

// Parse JSON for other routes
app.use(express.json());

// Services routes
app.use("/services", serviceRoutes);

// Booking routes
app.use("/bookings", bookingRoutes);

app.use("/admin", adminRoutes);

// Server health check
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
