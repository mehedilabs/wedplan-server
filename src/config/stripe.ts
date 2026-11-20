
import Stripe from "stripe";

let stripe: Stripe | null = null;

export const getStripe = () => {
  if (stripe) {
    return stripe;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not defined");
  }

  stripe = new Stripe(stripeSecretKey);

  return stripe;
};
