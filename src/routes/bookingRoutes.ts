
import { Router } from "express";
import { ObjectId } from "mongodb";
import { bookingsCollection, servicesCollection } from "../utils/collections";

const router = Router();

// Get all bookings submitted by a customer
router.get("/customer/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId.trim()) {
      res.status(400).send({
        success: false,
        message: "Customer ID is required",
      });
      return;
    }

    const bookings = await bookingsCollection()
      .find({ customerId: customerId.trim() })
      .sort({ createdAt: -1 })
      .toArray();

    const bookingsWithServiceDetails = await Promise.all(
      bookings.map(async (booking) => {
        const service = ObjectId.isValid(booking.serviceId)
          ? await servicesCollection().findOne({
              _id: new ObjectId(booking.serviceId),
            })
          : null;

        return {
          ...booking,
          vendorName: service?.vendorName ?? "Vendor",
          price: service?.price ?? null,
          image: service?.images?.[0] ?? null,
        };
      }),
    );

    res.status(200).send({
      success: true,
      message: "Customer bookings fetched successfully",
      data: bookingsWithServiceDetails,
    });
  } catch (error) {
    console.error("Failed to fetch customer bookings:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch customer bookings",
    });
  }
});

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

// Cancel a customer's pending booking
router.patch("/:bookingId/cancel", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { customerId } = req.body;

    // Validate required fields
    if (!bookingId || !customerId) {
      res.status(400).send({
        success: false,
        message: "Booking ID and customer ID are required",
      });
      return;
    }

    // Validate customer ID type
    if (typeof customerId !== "string" || !customerId.trim()) {
      res.status(400).send({
        success: false,
        message: "Invalid customer ID",
      });
      return;
    }

    // Validate booking ID
    if (!ObjectId.isValid(bookingId)) {
      res.status(400).send({
        success: false,
        message: "Invalid booking ID",
      });
      return;
    }

    // Find the customer's booking
    const booking = await bookingsCollection().findOne({
      _id: new ObjectId(bookingId),
      customerId: customerId.trim(),
    });

    if (!booking) {
      res.status(404).send({
        success: false,
        message: "Booking not found",
      });
      return;
    }

    // Only pending bookings can be cancelled
    if (booking.status !== "pending") {
      res.status(400).send({
        success: false,
        message: "Only pending bookings can be cancelled",
      });
      return;
    }

    // Permanently delete the pending booking
    const result = await bookingsCollection().deleteOne({
      _id: new ObjectId(bookingId),
      customerId: customerId.trim(),
      status: "pending",
    });

    if (result.deletedCount === 0) {
      res.status(400).send({
        success: false,
        message: "Unable to cancel this booking",
      });
      return;
    }

    res.status(200).send({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Failed to cancel booking:", error);

    res.status(500).send({
      success: false,
      message: "Failed to cancel booking",
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
