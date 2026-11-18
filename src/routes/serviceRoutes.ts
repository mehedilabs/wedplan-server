
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

// Add a new service
router.post("/", async (req, res) => {
  try {
    const {
      vendorId,
      serviceName,
      category,
      description,
      price,
      location,
      images,
    } = req.body;

    const allowedCategories = [
      "Photography & Videography",
      "Wedding Venues",
      "Decoration & Florist",
      "Catering Services",
      "Makeup & Styling",
      "Wedding Fashion",
    ];

    if (
      !vendorId ||
      !serviceName ||
      !category ||
      !description ||
      price === undefined ||
      !location ||
      !Array.isArray(images) ||
      images.length === 0
    ) {
      res.status(400).send({
        success: false,
        message: "Please provide all required service information",
      });
      return;
    }

    if (
      typeof vendorId !== "string" ||
      typeof serviceName !== "string" ||
      typeof category !== "string" ||
      typeof description !== "string" ||
      typeof location !== "string"
    ) {
      res.status(400).send({
        success: false,
        message: "Invalid service information",
      });
      return;
    }

    if (!allowedCategories.includes(category)) {
      res.status(400).send({
        success: false,
        message: "Invalid service category",
      });
      return;
    }

    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      res.status(400).send({
        success: false,
        message: "Price must be a positive number",
      });
      return;
    }

    if (
      !images.every(
        (image: unknown) =>
          typeof image === "string" && image.trim().length > 0,
      )
    ) {
      res.status(400).send({
        success: false,
        message: "Please provide valid service image URLs",
      });
      return;
    }

    const newService = {
      vendorId: vendorId.trim(),
      serviceName: serviceName.trim(),
      category,
      description: description.trim(),
      price,
      location: location.trim(),
      images,
      status: "pending" as const,
      isActive: true,
      createdAt: new Date(),
    };

    const result = await servicesCollection().insertOne(newService);

    res.status(201).send({
      success: true,
      message: "Service added successfully",
      data: {
        insertedId: result.insertedId,
        ...newService,
      },
    });
  } catch (error) {
    console.error("Failed to add service:", error);

    res.status(500).send({
      success: false,
      message: "Failed to add service",
    });
  }
});

export default router;
