
import { ObjectId } from "mongodb";

export type ServiceStatus = "pending" | "approved" | "rejected";

export interface Service {
  _id?: ObjectId;
  vendorId: string;
  serviceName: string;
  category: string;
  description: string;
  price: number;
  location: string;
  images: string[];
  status: ServiceStatus;
  isActive: boolean;
  createdAt: Date;
}
