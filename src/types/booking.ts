
import { ObjectId } from "mongodb";

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export interface Booking {
  _id?: ObjectId;
  serviceId: string;
  serviceName: string;
  vendorId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  eventDate: string;
  eventLocation: string;
  message: string;
  status: BookingStatus;
  createdAt: Date;
}
