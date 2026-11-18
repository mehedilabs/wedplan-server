
import { db } from "../config/db";
import type { Service } from "../types/service";

export const servicesCollection = () => {
  return db.collection<Service>("services");
};
