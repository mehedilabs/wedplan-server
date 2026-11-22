import express, { Router } from "express";
import Stripe from "stripe";
import {
  ObjectId,
  type Filter,
  type Document,
} from "mongodb";
import { getStripe } from "../config/stripe";
import { verifyAuth, requireRole } from "../middlewares/auth";
import {
  usersCollection,
  transactionsCollection,
} from "../utils/collections";

const router = Router();

// Get the vendor's latest subscription status and payment details
router.get("/subscription", verifyAuth, requireRole("vendor"), async (req, res) => {
  try {
    const userId = req.user!._id.toString();

    const userFilter: Filter<Document> = ObjectId.isValid(userId)
      ? {
          $or: [
            { _id: new ObjectId(userId) },
            { id: userId },
          ],
        }
      : { id: userId };

    const user = await usersCollection().findOne(userFilter);

    if (!user || user.role !== "vendor") {
      res.status(404).send({
        success: false,
        message: "Vendor account not found.",
      });
      return;
    }

    const transaction = await transactionsCollection().findOne(
      {
        vendorId: userId,
        status: "paid",
      },
      {
        sort: { createdAt: -1 },
      },
    );

    res.status(200).send({
      success: true,
      data: {
        plan: user.subscriptionPlan === "premium" ? "premium" : "free",
        transaction: transaction
          ? {
              amount: transaction.amount,
              currency: transaction.currency,
              status: transaction.status,
              createdAt: transaction.createdAt,
              stripeSessionId: transaction.stripeSessionId,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Failed to load vendor subscription:", error);

    res.status(500).send({
      success: false,
      message: "Failed to load subscription information.",
    });
  }
});

// Create a Stripe Checkout Session (vendor only)
router.post("/create-checkout-session", verifyAuth, requireRole("vendor"), async (req, res) => {
  try {
    const vendor = req.user!;
    const userId = vendor._id.toString();

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
      client_reference_id: userId,
      customer_email: vendor.email,
      metadata: {
        userId,
        userRole: vendor.role,
        priceId,
      },
      success_url: `${clientUrl}/dashboard/vendor/subscription/success`,
      cancel_url: `${clientUrl}/dashboard/vendor/subscription/cancel`,
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

        const userId = session.metadata?.userId || session.client_reference_id;
        const userRole = session.metadata?.userRole;
        const priceId = session.metadata?.priceId;

        // Validate basic parameters
        if (
          session.payment_status !== "paid" ||
          session.mode !== "payment" ||
          userRole !== "vendor" ||
          !userId ||
          priceId !== process.env.STRIPE_PREMIUM_PRICE_ID ||
          !session.amount_total ||
          session.amount_total <= 0
        ) {
          console.log("Ignoring invalid or unpaid Checkout Session");
          res.status(200).send({ received: true });
          return;
        }

        // Expand session line items directly from Stripe to verify purchased price ID
        const stripe = getStripe();
        const expandedSession = await stripe.checkout.sessions.retrieve(
          session.id,
          { expand: ["line_items"] },
        );

        const purchasedPriceId =
          expandedSession.line_items?.data?.[0]?.price?.id;
        if (purchasedPriceId !== process.env.STRIPE_PREMIUM_PRICE_ID) {
          console.error("Premium activation rejected: line item price mismatch", {
            purchasedPriceId,
            expected: process.env.STRIPE_PREMIUM_PRICE_ID,
          });
          res.status(200).send({ received: true });
          return;
        }

        // Verify the actual current database user is an active Vendor
        const userFilter: Filter<Document> = ObjectId.isValid(userId)
          ? {
              $or: [
                { _id: new ObjectId(userId) },
                { id: userId },
              ],
            }
          : { id: userId };

        const dbUser = await usersCollection().findOne(userFilter);

        if (!dbUser || dbUser.role !== "vendor") {
          console.error("Premium activation rejected: user is not a vendor in DB", userId);
          res.status(200).send({ received: true });
          return;
        }

        if (dbUser.status === "blocked" || dbUser.status === "inactive") {
          console.error("Premium activation rejected: user account is blocked or inactive", userId);
          res.status(200).send({ received: true });
          return;
        }

        // Activate lifetime Premium
        await usersCollection().updateOne(userFilter, {
          $set: {
            subscriptionPlan: "premium",
            subscriptionExpiresAt: null,
          },
        });

        console.log("Vendor Premium activated successfully:", userId);

        // Save transaction without creating duplicates (idempotent upsert)
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
