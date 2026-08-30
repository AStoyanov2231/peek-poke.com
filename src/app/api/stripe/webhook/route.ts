import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/stripe-webhook.server";
import { withRequestContext } from "@/lib/request-context";
import { readBoundedBody } from "@/lib/upload";

const MAX_WEBHOOK_BYTES = 1_048_576;

export const POST = withRequestContext(async (req: NextRequest) => {
  const bytes = await readBoundedBody(req, MAX_WEBHOOK_BYTES);
  if (!bytes) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const body = new TextDecoder().decode(bytes);
  const signature = req.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const eventContext = { id: event.id, created: event.created };
  let errorResponse: NextResponse | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      errorResponse = await handleCheckoutCompleted(session, supabase, eventContext);
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      errorResponse = await handleSubscriptionUpdated(subscription, supabase, eventContext);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      errorResponse = await handleSubscriptionDeleted(subscription, supabase, eventContext);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.error("Payment failed for customer:", invoice.customer, "invoice:", invoice.id);
      break;
    }
    case "customer.subscription.paused": {
      const subscription = event.data.object as Stripe.Subscription;
      errorResponse = await handleSubscriptionUpdated(subscription, supabase, eventContext);
      break;
    }
    default:
      console.log(`Unhandled Stripe webhook event: ${event.type}`);
  }

  if (errorResponse) return errorResponse;

  return NextResponse.json({ received: true });
});
