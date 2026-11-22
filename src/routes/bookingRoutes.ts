import { Router, type Response } from "express";
import { ObjectId } from "mongodb";
import { bookingsCollection, servicesCollection } from "../utils/collections";
import {
  verifyAuth,
  optionalAuth,
  requireRole,
} from "../middlewares/auth";

const router = Router();

const getParamString = (param: unknown): string => {
  if (typeof param === "string") return param;
  if (Array.isArray(param)) return param[0] || "";
  return String(param || "");
};

// Get all bookings submitted by a customer (customer owner or admin only)
router.get(
  "/customer/:customerId",
  verifyAuth,
  async (req, res) => {
    try {
      const customerId = getParamString(req.params.customerId).trim();

      if (!customerId) {
        res.status(400).send({
          success: false,
          message: "Customer ID is required",
        });
        return;
      }

      const isOwner = req.user!._id.toString() === customerId;
      const isAdmin = req.user!.role === "admin";

      if (!isOwner && !isAdmin) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You can only view your own bookings.",
        });
        return;
      }

      const bookings = await bookingsCollection()
        .find({ customerId })
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
  },
);

// Get all booking requests submitted to a vendor (vendor owner or admin only)
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

      const isOwner = req.user!._id.toString() === vendorId;
      const isAdmin = req.user!.role === "admin";

      if (!isOwner && !isAdmin) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You can only view your own booking requests.",
        });
        return;
      }

      const bookings = await bookingsCollection()
        .find({ vendorId })
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
            price: service?.price ?? null,
            image: service?.images?.[0] ?? null,
          };
        }),
      );

      res.status(200).send({
        success: true,
        message: "Vendor booking requests fetched successfully",
        data: bookingsWithServiceDetails,
      });
    } catch (error) {
      console.error("Failed to fetch vendor booking requests:", error);

      res.status(500).send({
        success: false,
        message: "Failed to fetch vendor booking requests",
      });
    }
  },
);

// Update a pending booking request status (vendor only, verifies service and booking ownership)
const updateBookingStatus = async (
  bookingId: string,
  authenticatedVendorId: string,
  status: "confirmed" | "rejected",
  res: Response,
) => {
  try {
    if (!ObjectId.isValid(bookingId)) {
      res.status(400).send({
        success: false,
        message: "Invalid booking ID",
      });
      return;
    }

    // Check whether the booking exists
    const booking = await bookingsCollection().findOne({
      _id: new ObjectId(bookingId),
    });

    if (!booking) {
      res.status(404).send({
        success: false,
        message: "Booking not found",
      });
      return;
    }

    // Verify ownership: booking belongs to this authenticated vendor
    if (booking.vendorId !== authenticatedVendorId) {
      res.status(403).send({
        success: false,
        message: "Forbidden. You can only respond to booking requests for your own services.",
      });
      return;
    }

    // Also verify associated service belongs to this authenticated vendor
    if (ObjectId.isValid(booking.serviceId)) {
      const service = await servicesCollection().findOne({
        _id: new ObjectId(booking.serviceId),
      });

      if (service && service.vendorId !== authenticatedVendorId) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You do not own the service associated with this booking.",
        });
        return;
      }
    }

    // Only pending bookings can be updated
    if (booking.status !== "pending") {
      res.status(400).send({
        success: false,
        message: "Only pending booking requests can be updated",
      });
      return;
    }

    // Update the booking status
    const result = await bookingsCollection().updateOne(
      {
        _id: new ObjectId(bookingId),
        vendorId: authenticatedVendorId,
        status: "pending",
      },
      {
        $set: { status },
      },
    );

    if (result.modifiedCount === 0) {
      res.status(409).send({
        success: false,
        message: "This booking request has already been updated",
      });
      return;
    }

    res.status(200).send({
      success: true,
      message:
        status === "confirmed"
          ? "Booking request accepted successfully"
          : "Booking request rejected successfully",
      data: {
        bookingId,
        status,
      },
    });
  } catch (error) {
    console.error("Failed to update booking status:", error);

    res.status(500).send({
      success: false,
      message: "Failed to update booking status",
    });
  }
};

// Accept a pending booking request (vendor owner only)
router.patch(
  "/:bookingId/accept",
  verifyAuth,
  requireRole("vendor"),
  async (req, res) => {
    const bookingId = getParamString(req.params.bookingId);
    await updateBookingStatus(
      bookingId,
      req.user!._id.toString(),
      "confirmed",
      res,
    );
  },
);

// Reject a pending booking request (vendor owner only)
router.patch(
  "/:bookingId/reject",
  verifyAuth,
  requireRole("vendor"),
  async (req, res) => {
    const bookingId = getParamString(req.params.bookingId);
    await updateBookingStatus(
      bookingId,
      req.user!._id.toString(),
      "rejected",
      res,
    );
  },
);

// Check whether the authenticated customer already has an active booking for this service (and optional eventDate)
router.get(
  "/status",
  verifyAuth,
  requireRole("customer"),
  async (req, res) => {
    try {
      const serviceId =
        typeof req.query.serviceId === "string"
          ? req.query.serviceId.trim()
          : "";
      const eventDate =
        typeof req.query.eventDate === "string"
          ? req.query.eventDate.trim()
          : "";
      const customerId = req.user!._id.toString();

      if (!serviceId) {
        res.status(400).send({
          success: false,
          message: "Service ID is required",
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

      const filter: Record<string, any> = {
        serviceId,
        customerId,
        status: { $nin: ["rejected", "cancelled"] },
      };

      if (eventDate) {
        filter.eventDate = eventDate;
      }

      const existingBooking = await bookingsCollection().findOne(filter);

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
  },
);

// Cancel a customer's pending booking (customer owner only)
router.patch(
  "/:bookingId/cancel",
  verifyAuth,
  requireRole("customer"),
  async (req, res) => {
    try {
      const bookingId = getParamString(req.params.bookingId);
      const authenticatedCustomerId = req.user!._id.toString();

      if (!ObjectId.isValid(bookingId)) {
        res.status(400).send({
          success: false,
          message: "Invalid booking ID",
        });
        return;
      }

      const booking = await bookingsCollection().findOne({
        _id: new ObjectId(bookingId),
      });

      if (!booking) {
        res.status(404).send({
          success: false,
          message: "Booking not found",
        });
        return;
      }

      if (booking.customerId !== authenticatedCustomerId) {
        res.status(403).send({
          success: false,
          message: "Forbidden. You can only cancel your own bookings.",
        });
        return;
      }

      if (booking.status !== "pending") {
        res.status(400).send({
          success: false,
          message: "Only pending bookings can be cancelled",
        });
        return;
      }

      const result = await bookingsCollection().updateOne(
        {
          _id: new ObjectId(bookingId),
          customerId: authenticatedCustomerId,
          status: "pending",
        },
        {
          $set: {
            status: "cancelled",
            updatedAt: new Date(),
          },
        },
      );

      if (result.modifiedCount === 0) {
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
  },
);

// Create a booking request (authenticated customer only)
router.post(
  "/",
  verifyAuth,
  requireRole("customer"),
  async (req, res) => {
    try {
      const authenticatedCustomer = req.user!;
      const customerId = authenticatedCustomer._id.toString();
      const customerName = authenticatedCustomer.name;
      const customerEmail = authenticatedCustomer.email;

      const {
        serviceId,
        eventDate,
        eventLocation,
        message,
      } = req.body;

      if (!serviceId || !eventDate || !eventLocation || !message) {
        res.status(400).send({
          success: false,
          message: "Please provide all required booking information",
        });
        return;
      }

      if (
        typeof serviceId !== "string" ||
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

      if (!ObjectId.isValid(serviceId)) {
        res.status(400).send({
          success: false,
          message: "Invalid service ID",
        });
        return;
      }

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

      if (service.status !== "approved" || !service.isActive) {
        res.status(400).send({
          success: false,
          message: "This service is not available for booking",
        });
        return;
      }

      if (service.vendorId === customerId) {
        res.status(403).send({
          success: false,
          message: "You cannot book your own service",
        });
        return;
      }

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

      // Prevent duplicate active booking requests for the same service and event date
      const duplicateDateBooking = await bookingsCollection().findOne({
        serviceId,
        customerId,
        eventDate,
        status: { $nin: ["rejected", "cancelled"] },
      });

      if (duplicateDateBooking) {
        res.status(409).send({
          success: false,
          message:
            "You already have an active booking request for this service on this event date.",
        });
        return;
      }

      const newBooking = {
        serviceId,
        serviceName: service.serviceName,
        vendorId: service.vendorId,
        customerId,
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
  },
);

export default router;
