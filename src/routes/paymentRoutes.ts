
import express, { Router } from "express";
import Stripe from "stripe";
import {
  ObjectId,
  type Filter,
  type Document,
} from "mongodb";
import { getStripe } from "../config/stripe";
import { verifyVendor } from "../utils/verifyVendor";
import {
  usersCollection,
  transactionsCollection,
} from "../utils/collections";

const router = Router();

// Create a Stripe Checkout Session
router.post("/create-checkout-session", async (req, res) => {
  try {
    const vendor = await verifyVendor(req);

    if (!vendor) {
      res.status(401).send({
        success: false,
        message: "Unauthorized. Please sign in as a vendor.",
      });
      return;
    }

    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;

    if (!priceId) {
      throw new Error("STRIPE_PREMIUM_PRICE_ID is not defined");
    }

    const stripe = getStripe();
    const clientUrl = process.env.CLIENT_URL;

    if (!clientUrl) {
      throw new Error("CLIENT_URL is not defined");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: vendor.id,
      customer_email: vendor.email,
      metadata: {
        userId: vendor.id,
        userRole: vendor.role,
        priceId,
      },
      success_url: `${clientUrl}/dashboard/vendor/subscription?payment=success`,
      cancel_url: `${clientUrl}/dashboard/vendor/subscription?payment=cancelled`,
    });

    res.status(200).send({
      success: true,
      message: "Checkout session created successfully",
      data: { url: session.url },
    });
  } catch (error) {
    console.error("Failed to create Stripe Checkout Session:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create checkout session",
    });
  }
});

// Verify Stripe webhook and activate Premium
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      res.status(400).send("Missing webhook configuration");
      return;
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripe();

      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        signature,
        webhookSecret,
      );
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      res.status(400).send("Invalid webhook signature");
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.userId;
        const userRole = session.metadata?.userRole;
        const priceId = session.metadata?.priceId;

        // Validate successful payment
        if (
          session.payment_status !== "paid" ||
          session.mode !== "payment" ||
          userRole !== "vendor" ||
          !userId ||
          session.client_reference_id !== userId ||
          priceId !== process.env.STRIPE_PREMIUM_PRICE_ID
        ) {
          console.log("Ignoring an invalid or unpaid Checkout Session");
          res.status(200).send({ received: true });
          return;
        }

        // Find vendor in MongoDB
        const userFilter: Filter<Document> = ObjectId.isValid(userId)
          ? {
              $or: [
                { _id: new ObjectId(userId) },
                { id: userId },
              ],
            }
          : { id: userId };

        // Activate lifetime Premium
        const result = await usersCollection().updateOne(userFilter, {
          $set: {
            subscriptionPlan: "premium",
            subscriptionExpiresAt: null,
          },
        });

        if (result.matchedCount === 0) {
          console.error(
            "Premium activation failed: Vendor not found",
            userId,
          );

          res.status(500).send("Vendor not found");
          return;
        }

        console.log("Vendor Premium activated successfully:", userId);

        // Save transaction without creating duplicates
        const transaction = {
          vendorId: userId,
          plan: "premium" as const,
          amount: (session.amount_total ?? 0) / 100,
          currency: session.currency ?? "usd",
          stripeSessionId: session.id,
          stripeSubscriptionId: null,
          status: "paid" as const,
          createdAt: new Date(session.created * 1000),
        };

        await transactionsCollection().updateOne(
          { stripeSessionId: session.id },
          {
            $setOnInsert: transaction,
          },
          { upsert: true },
        );

        console.log(
          "Transaction saved successfully:",
          session.id,
        );
      }

      res.status(200).send({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed:", error);

      res.status(500).send("Webhook processing failed");
    }
  },
);

export default router;
