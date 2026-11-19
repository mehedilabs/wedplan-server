
import { Router } from "express";
import { servicesCollection } from "../utils/collections";
import { ObjectId } from "mongodb";

const router = Router();

import multer from "multer";
import { uploadImage } from "../utils/imageUpload";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Upload service image
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).send({
        success: false,
        message: "Please select an image",
      });
      return;
    }

    const imageUrl = await uploadImage(req.file);

    res.status(200).send({
      success: true,
      message: "Image uploaded successfully",
      data: {
        url: imageUrl,
      },
    });
  } catch (error) {
    console.error("Failed to upload image:", error);

    res.status(500).send({
      success: false,
      message: "Failed to upload image",
    });
  }
});

// Get a single service by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      res.status(400).send({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const service = await servicesCollection().findOne({
      _id: new ObjectId(id),
    });

    if (!service) {
      res.status(404).send({
        success: false,
        message: "Service not found",
      });
      return;
    }

    res.status(200).send({
      success: true,
      message: "Service details fetched successfully",
      data: service,
    });
  } catch (error) {
    console.error("Failed to fetch service details:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch service details",
    });
  }
});

// Get services by vendor ID
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId || !vendorId.trim()) {
      res.status(400).send({
        success: false,
        message: "Vendor ID is required",
      });
      return;
    }

    const services = await servicesCollection()
      .find({
        vendorId: vendorId.trim(),
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send({
      success: true,
      message: "Vendor services fetched successfully",
      data: services,
    });
  } catch (error) {
    console.error("Failed to fetch vendor services:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch vendor services",
    });
  }
});


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
  vendorName,
  vendorEmail,
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
  !vendorName ||
  !vendorEmail ||
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
      typeof vendorName !== "string" ||
      typeof vendorEmail !== "string" ||
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
  vendorName: vendorName.trim(),
  vendorEmail: vendorEmail.trim(),
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
