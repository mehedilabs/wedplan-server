
import { db } from "../config/db";
import type { Service } from "../types/service";
import type { Booking } from "../types/booking";

export const servicesCollection = () => {
  return db.collection<Service>("services");
};

export const bookingsCollection = () => {
  return db.collection<Booking>("bookings");
};
