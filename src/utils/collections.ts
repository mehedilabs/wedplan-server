
import { db } from "../config/db";
import type { Service } from "../types/service";
import type { Booking } from "../types/booking";
import type { Transaction } from "../types/transaction";

export const servicesCollection = () => {
  return db.collection<Service>("services");
};

export const bookingsCollection = () => {
  return db.collection<Booking>("bookings");
};

export const usersCollection = () => {
  return db.collection("user");
};

export const transactionsCollection = () => {
  return db.collection<Transaction>("transactions");
};
