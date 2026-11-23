import { Router } from "express";
import { servicesCollection, usersCollection } from "../utils/collections";
import { ObjectId } from "mongodb";
import multer from "multer";
import { uploadImage } from "../utils/imageUpload";
import { validateImageFile } from "../utils/fileValidation";
import {
  verifyAuth,
  optionalAuth,
  requireRole,
} from "../middlewares/auth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const getParamString = (param: unknown): string => {
  if (typeof param === "string") return param;
  if (Array.isArray(param)) return param[0] || "";
  return String(param || "");
};

// Upload profile image (used during signup before account creation, as well as profile updates)
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    const validation = validateImageFile(req.file);
    if (!validation.isValid) {
      res.status(400).send({
        success: false,
        message: validation.error || "Please select a valid image file",
      });
      return;
    }

    const imageUrl = await uploadImage(req.file!);

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

// Upload authenticated service image (restricted to authenticated vendors)
router.post(
  "/upload-service-image",
  verifyAuth,
  requireRole("vendor"),
  upload.single("image"),
  async (req, res) => {
    try {
      const validation = validateImageFile(req.file);
      if (!validation.isValid) {
        res.status(400).send({
          success: false,
          message: validation.error || "Please select a valid image file",
        });
        return;
      }

      const imageUrl = await uploadImage(req.file!);

      res.status(200).send({
        success: true,
        message: "Service image uploaded successfully",
        data: {
          url: imageUrl,
        },
      });
    } catch (error) {
      console.error("Failed to upload service image:", error);

      res.status(500).send({
        success: false,
        message: "Failed to upload service image",
      });
    }
  },
);

// Update a service (vendor owner only)
router.patch(
  "/:id",
  verifyAuth,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const id = getParamString(req.params.id);
      const authenticatedVendorId = req.user!._id.toString();

      const {
        serviceName,
        category,
        description,
        price,
        location,
        images,
      } = req.body;

      if (!ObjectId.isValid(id)) {
        res.status(400).send({
          success: false,
          message: "Invalid service ID",
        });
        return;
      }

      // Check service existence and ownership
      const existingService = await servicesCollection().findOne({
        _id: new ObjectId(id),
      });

      if (!existingService) {
        res.status(404).send({
          success: false,
          message: "Service not found",
        });
        return;
      }

      if (existingService.vendorId !== authenticatedVendorId) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You can only edit your own services.",
        });
        return;
      }

      const allowedCategories = [
        "Photography & Videography",
        "Wedding Venues",
        "Decoration & Florist",
        "Catering Services",
        "Makeup & Styling",
        "Wedding Fashion",
      ];

      if (
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

      if (!allowedCategories.includes(category)) {
        res.status(400).send({
          success: false,
          message: "Invalid service category",
        });
        return;
      }

      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
        res.status(400).send({
          success: false,
          message: "Price must be a positive number",
        });
        return;
      }

      if (
        typeof serviceName !== "string" ||
        typeof description !== "string" ||
        typeof location !== "string" ||
        !images.every(
          (image: unknown) =>
            typeof image === "string" && image.trim().length > 0,
        )
      ) {
        res.status(400).send({
          success: false,
          message: "Invalid service information",
        });
        return;
      }

      await servicesCollection().updateOne(
        {
          _id: new ObjectId(id),
          vendorId: authenticatedVendorId,
        },
        {
          $set: {
            serviceName: serviceName.trim(),
            category,
            description: description.trim(),
            price,
            location: location.trim(),
            images,
          },
        },
      );

      res.status(200).send({
        success: true,
        message: "Service updated successfully",
      });
    } catch (error) {
      console.error("Failed to update service:", error);

      res.status(500).send({
        success: false,
        message: "Failed to update service",
      });
    }
  },
);


// Toggle service active status (vendor owner only, pending and approved services)
router.patch(
  "/:id/availability",
  verifyAuth,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const id = getParamString(req.params.id);
      const authenticatedVendorId = req.user!._id.toString();
      const { isActive } = req.body;

      if (!ObjectId.isValid(id)) {
        res.status(400).send({
          success: false,
          message: "Invalid service ID",
        });
        return;
      }

      if (typeof isActive !== "boolean") {
        res.status(400).send({
          success: false,
          message: "isActive must be a boolean",
        });
        return;
      }

      const existingService = await servicesCollection().findOne({
        _id: new ObjectId(id),
      });

      if (!existingService) {
        res.status(404).send({
          success: false,
          message: "Service not found",
        });
        return;
      }

      if (existingService.vendorId !== authenticatedVendorId) {
        res.status(403).send({
          success: false,
          message:
            "Forbidden. You can only manage availability of your own services.",
        });
        return;
      }

      // Rejected services cannot have their active status changed
      if (existingService.status === "rejected") {
        res.status(400).send({
          success: false,
          message: "Rejected services cannot be activated or deactivated.",
        });
        return;
      }

      await servicesCollection().updateOne(
        {
          _id: new ObjectId(id),
          vendorId: authenticatedVendorId,
        },
        {
          $set: {
            isActive,
            updatedAt: new Date(),
          },
        },
      );

      res.status(200).send({
        success: true,
        message: `Service marked as ${isActive ? "active" : "inactive"} successfully`,
        data: {
          serviceId: id,
          isActive,
        },
      });
    } catch (error) {
      console.error("Failed to update service availability:", error);

      res.status(500).send({
        success: false,
        message: "Failed to update service availability",
      });
    }
  },
);


// Delete a service (vendor owner only)
router.delete(
  "/:id",
  verifyAuth,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const id = getParamString(req.params.id);
      const authenticatedVendorId = req.user!._id.toString();

      if (!ObjectId.isValid(id)) {
        res.status(400).send({
          success: false,
          message: "Invalid service ID",
        });
        return;
      }

      const existingService = await servicesCollection().findOne({
        _id: new ObjectId(id),
      });

      if (!existingService) {
        res.status(404).send({
          success: false,
          message: "Service not found",
        });
        return;
      }

      if (existingService.vendorId !== authenticatedVendorId) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You can only delete your own services.",
        });
        return;
      }

      const result = await servicesCollection().deleteOne({
        _id: new ObjectId(id),
        vendorId: authenticatedVendorId,
      });

      if (result.deletedCount === 0) {
        res.status(404).send({
          success: false,
          message: "Service not found",
        });
        return;
      }

      res.status(200).send({
        success: true,
        message: "Service deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete service:", error);

      res.status(500).send({
        success: false,
        message: "Failed to delete service",
      });
    }
  },
);

// Get services by vendor ID (protected: vendor owner or admin only)
router.get(
  "/vendor/:vendorId",
  verifyAuth,
  async (req, res) => {
    try {
      const vendorId = getParamString(req.params.vendorId).trim();

      if (!vendorId) {
        res.status(400).send({
          success: false,
          message: "Vendor ID is required",
        });
        return;
      }

      // Ensure caller is the vendor themselves or an Admin
      const isOwner = req.user!._id.toString() === vendorId;
      const isAdmin = req.user!.role === "admin";

      if (!isOwner && !isAdmin) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You can only access your own vendor dashboard services.",
        });
        return;
      }

      const services = await servicesCollection()
        .find({
          vendorId,
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
  },
);

// Get a single service by ID (public for approved+active; owner or admin for unpublished)
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const id = getParamString(req.params.id);

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

    // If service is pending, rejected, or inactive, it should only be accessible by its owner vendor or an Admin
    const isPubliclyAvailable = service.status === "approved" && service.isActive;
    if (!isPubliclyAvailable) {
      const isOwner = req.user && req.user._id.toString() === service.vendorId;
      const isAdmin = req.user && req.user.role === "admin";

      if (!isOwner && !isAdmin) {
        res.status(404).send({
          success: false,
          message: "Service not found",
        });
        return;
      }
    }

    // Get vendor subscription status
    const vendor = ObjectId.isValid(service.vendorId)
      ? await usersCollection().findOne({
          _id: new ObjectId(service.vendorId),
        })
      : null;

    const serviceWithPremiumStatus = {
         ...service,
         isPremium: vendor?.subscriptionPlan === "premium",
         vendorImage: vendor?.image ?? null,
     };

    res.status(200).send({
      success: true,
      message: "Service details fetched successfully",
      data: serviceWithPremiumStatus,
    });
  } catch (error) {
    console.error("Failed to fetch service details:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch service details",
    });
  }
});

// Get all approved and active services (public listing)
router.get("/", async (req, res) => {
  try {
    const services = await servicesCollection()
      .find({
        status: "approved",
        isActive: true,
      })
      .toArray();

    // Collect unique vendor IDs
    const vendorIds = [
      ...new Set(
        services
          .map((service) => service.vendorId)
          .filter((id) => ObjectId.isValid(id)),
      ),
    ].map((id) => new ObjectId(id));

    // Fetch vendor subscription information
    const vendors = await usersCollection()
      .find({
        _id: { $in: vendorIds },
      })
      .project({ subscriptionPlan: 1, image: 1 })
      .toArray();

    // Collect Premium vendor IDs
    const premiumVendorIds = new Set(
      vendors
        .filter((vendor) => vendor.subscriptionPlan === "premium")
        .map((vendor) => vendor._id.toString()),
    );

    // Add Premium status and vendor profile image to each service
const servicesWithPremiumStatus = services.map((service) => {
  const vendor = vendors.find(
    (vendor) => vendor._id.toString() === service.vendorId,
  );

  return {
    ...service,
    isPremium: premiumVendorIds.has(service.vendorId),
    vendorImage: vendor?.image ?? null,
  };
});

    res.status(200).send({
      success: true,
      message: "Services fetched successfully",
      data: servicesWithPremiumStatus,
    });
  } catch (error) {
    console.error("Failed to fetch services:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch services",
    });
  }
});

// Add a new service (authenticated vendor only)
router.post(
  "/",
  verifyAuth,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const authenticatedVendor = req.user!;
      const vendorId = authenticatedVendor._id.toString();
      const vendorName = authenticatedVendor.name;
      const vendorEmail = authenticatedVendor.email;

      const {
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

      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
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

      // Check vendor subscription and service limit
      const subscriptionPlan = authenticatedVendor.subscriptionPlan ?? "free";

      if (subscriptionPlan !== "premium") {
        const vendorServicesCount = await servicesCollection().countDocuments({
          vendorId,
        });

        if (vendorServicesCount >= 3) {
          res.status(403).send({
            success: false,
            message:
              "Your Free plan allows up to 3 services. Please delete an existing service to add a new one, or upgrade to Premium for unlimited services.",
          });
          return;
        }
      }

      const newService = {
        vendorId,
        vendorName,
        vendorEmail,
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
  },
);

export default router;
