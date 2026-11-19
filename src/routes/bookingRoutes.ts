
import { Router } from "express";
import { ObjectId } from "mongodb";
import { bookingsCollection, servicesCollection } from "../utils/collections";

const router = Router();

// Check whether the customer already has an active booking for this service
router.get("/status", async (req, res) => {
  try {
    const serviceId = req.query.serviceId;
    const customerId = req.query.customerId;

    if (
      typeof serviceId !== "string" ||
      typeof customerId !== "string" ||
      !serviceId.trim() ||
      !customerId.trim()
    ) {
      res.status(400).send({
        success: false,
        message: "Service ID and customer ID are required",
      });
      return;
    }

    if (!ObjectId.isValid(serviceId)) {
      res.status(400).send({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const existingBooking = await bookingsCollection().findOne({
      serviceId,
      customerId: customerId.trim(),
      status: { $nin: ["rejected", "cancelled"] },
    });

    res.status(200).send({
      success: true,
      message: "Booking status checked successfully",
      data: {
        hasActiveBooking: Boolean(existingBooking),
      },
    });
  } catch (error) {
    console.error("Failed to check booking status:", error);

    res.status(500).send({
      success: false,
      message: "Failed to check booking status",
    });
  }
});

// Create a booking request
router.post("/", async (req, res) => {
  try {
    const {
      serviceId,
      customerId,
      customerName,
      customerEmail,
      eventDate,
      eventLocation,
      message,
    } = req.body;

    // Validate required fields
    if (
      !serviceId ||
      !customerId ||
      !customerName ||
      !customerEmail ||
      !eventDate ||
      !eventLocation ||
      !message
    ) {
      res.status(400).send({
        success: false,
        message: "Please provide all required booking information",
      });
      return;
    }

    // Validate field types
    if (
      typeof serviceId !== "string" ||
      typeof customerId !== "string" ||
      typeof customerName !== "string" ||
      typeof customerEmail !== "string" ||
      typeof eventDate !== "string" ||
      typeof eventLocation !== "string" ||
      typeof message !== "string"
    ) {
      res.status(400).send({
        success: false,
        message: "Invalid booking information",
      });
      return;
    }

    const normalizedCustomerId = customerId.trim();

    // Validate service ID
    if (!ObjectId.isValid(serviceId)) {
      res.status(400).send({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    // Find the selected service
    const service = await servicesCollection().findOne({
      _id: new ObjectId(serviceId),
    });

    if (!service) {
      res.status(404).send({
        success: false,
        message: "Service not found",
      });
      return;
    }

    // Only approved and active services can be booked
    if (service.status !== "approved" || !service.isActive) {
      res.status(400).send({
        success: false,
        message: "This service is not available for booking",
      });
      return;
    }

    // Prevent vendors from booking their own services
    if (service.vendorId === normalizedCustomerId) {
      res.status(403).send({
        success: false,
        message: "You cannot book your own service",
      });
      return;
    }

    // Validate event date
    if (
      Number.isNaN(Date.parse(eventDate)) ||
      new Date(eventDate) < new Date()
    ) {
      res.status(400).send({
        success: false,
        message: "Please provide a valid future event date",
      });
      return;
    }

    // Prevent multiple active bookings for the same service
    const existingBooking = await bookingsCollection().findOne({
      serviceId,
      customerId: normalizedCustomerId,
      status: { $nin: ["rejected", "cancelled"] },
    });

    if (existingBooking) {
      res.status(409).send({
        success: false,
        message:
          "You already have an active booking request for this service. You can book again after it is rejected or cancelled.",
      });
      return;
    }

    // Create booking document
    const newBooking = {
      serviceId,
      serviceName: service.serviceName,
      vendorId: service.vendorId,
      customerId: normalizedCustomerId,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      eventDate,
      eventLocation: eventLocation.trim(),
      message: message.trim(),
      status: "pending" as const,
      createdAt: new Date(),
    };

    const result = await bookingsCollection().insertOne(newBooking);

    res.status(201).send({
      success: true,
      message: "Booking request submitted successfully",
      data: {
        insertedId: result.insertedId,
        ...newBooking,
      },
    });
  } catch (error) {
    console.error("Failed to create booking:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create booking request",
    });
  }
});

export default router;
