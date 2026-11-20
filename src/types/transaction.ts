
export interface Transaction {
  vendorId: string;
  plan: "premium";
  amount: number;
  currency: string;
  stripeSessionId: string;
  stripeSubscriptionId: string | null;
  status: "paid";
  createdAt: Date;
}
