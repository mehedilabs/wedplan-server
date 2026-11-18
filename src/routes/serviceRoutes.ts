
import { Router } from "express";
import { servicesCollection } from "../utils/collections";

const router = Router();

// Get all approved and active services
router.get("/", async (req, res) => {
  try {
    const services = await servicesCollection()
      .find({
        status: "approved",
        isActive: true,
      })
      .toArray();

    res.status(200).send({
      success: true,
      message: "Services fetched successfully",
      data: services,
    });
  } catch (error) {
    console.error("Failed to fetch services:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch services",
    });
  }
});

export default router;
