import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { isValidUUID } from "@/lib/validation";
import { applyEntitlementEvent } from "@/lib/billing/entitlements";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type StripeEventContext = { id: string; created: number };

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const fallback = Math.floor(Date.now() / 1000);
  return {
    start: item?.current_period_start ?? fallback,
    end: item?.current_period_end ?? fallback,
  };
}

function stripeEventContext(subscription: Stripe.Subscription, context?: StripeEventContext) {
  return context ?? {
    id: `subscription:${subscription.id}:${subscription.status}:${getSubscriptionPeriod(subscription).end}`,
    created: Math.floor(Date.now() / 1000),
  };
}

async function syncStripeEntitlement(
  supabase: ServiceClient,
  subscription: Stripe.Subscription,
  userId: string,
  active: boolean,
  context?: StripeEventContext
) {
  const event = stripeEventContext(subscription, context);
  const { end } = getSubscriptionPeriod(subscription);
  return applyEntitlementEvent(supabase, {
    userId,
    provider: "stripe",
    eventId: event.id,
    eventAt: new Date(event.created * 1000),
    active,
    expiresAt: active ? new Date(end * 1000) : null,
    productId: subscription.items.data[0]?.price.id ?? null,
  });
}

function missingUserResponse() {
  return NextResponse.json({
    received: true,
    warning: "Missing user metadata - requires manual reconciliation",
  });
}

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: ServiceClient,
  context?: StripeEventContext
): Promise<NextResponse | null> {
  if (!session.subscription) return null;

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );
  } catch (err) {
    console.error("Failed to retrieve subscription from Stripe:", err);
    return NextResponse.json(
      { error: "Failed to retrieve subscription" },
      { status: 500 }
    );
  }

  const userId = subscription.metadata.supabase_user_id;
  if (!userId || !isValidUUID(userId)) {
    console.error("checkout.session.completed: Missing/invalid supabase_user_id in subscription metadata", {
      subscriptionId: subscription.id,
      sessionId: session.id,
    });
    return missingUserResponse();
  }

  const { start: periodStart, end: periodEnd } = getSubscriptionPeriod(subscription);

  const entitlement = await syncStripeEntitlement(
    supabase,
    subscription,
    userId,
    subscription.status === "active" || subscription.status === "trialing",
    context
  );
  if (!entitlement.ok) {
    console.error(`Critical: Failed to grant subscriber role to user ${userId} after checkout.session.completed`);
    return NextResponse.json(
      { error: "Failed to grant subscriber role" },
      { status: 500 }
    );
  }
  if (!entitlement.applied) return null;

  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        status: subscription.status,
        current_period_start: new Date(periodStart * 1000).toISOString(),
        current_period_end: new Date(periodEnd * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" }
    );

  if (subscriptionError) {
    console.error(`Failed to create subscription record for user ${userId}:`, subscriptionError);
    return NextResponse.json(
      { error: "Failed to create subscription record" },
      { status: 500 }
    );
  }

  return null;
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: ServiceClient,
  context?: StripeEventContext
): Promise<NextResponse | null> {
  const userId = subscription.metadata.supabase_user_id;
  if (!userId || !isValidUUID(userId)) {
    console.error("customer.subscription.updated: Missing/invalid supabase_user_id in subscription metadata", {
      subscriptionId: subscription.id,
    });
    return missingUserResponse();
  }

  const isActive =
    subscription.status === "active" || subscription.status === "trialing";
  const { end: periodEnd } = getSubscriptionPeriod(subscription);

  const entitlement = await syncStripeEntitlement(supabase, subscription, userId, isActive, context);
  if (!entitlement.ok) {
    console.error(`Critical: Failed to ${isActive ? "grant" : "revoke"} subscriber role for user ${userId} on subscription update`);
    return NextResponse.json(
      { error: `Failed to ${isActive ? "grant" : "revoke"} subscriber role` },
      { status: 500 }
    );
  }
  if (!entitlement.applied) return null;

  const { start: periodStart } = getSubscriptionPeriod(subscription);
  const { error: updateError } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      status: subscription.status,
      current_period_start: new Date(periodStart * 1000).toISOString(),
      current_period_end: new Date(periodEnd * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });

  if (updateError) {
    console.error(`Failed to update subscription record for ${subscription.id}:`, updateError);
    return NextResponse.json(
      { error: "Failed to update subscription record" },
      { status: 500 }
    );
  }

  return null;
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: ServiceClient,
  context?: StripeEventContext
): Promise<NextResponse | null> {
  const userId = subscription.metadata.supabase_user_id;
  if (!userId || !isValidUUID(userId)) {
    console.error("customer.subscription.deleted: Missing/invalid supabase_user_id in subscription metadata", {
      subscriptionId: subscription.id,
    });
    return missingUserResponse();
  }

  const entitlement = await syncStripeEntitlement(supabase, subscription, userId, false, context);
  if (!entitlement.ok) {
    console.error(`Critical: Failed to revoke subscriber role from user ${userId} on subscription deletion`);
    return NextResponse.json(
      { error: "Failed to revoke subscriber role" },
      { status: 500 }
    );
  }
  if (!entitlement.applied) return null;

  const { start: periodStart, end: periodEnd } = getSubscriptionPeriod(subscription);
  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      status: "canceled",
      current_period_start: new Date(periodStart * 1000).toISOString(),
      current_period_end: new Date(periodEnd * 1000).toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });

  if (subscriptionError) {
    console.error(`Failed to update subscription record for ${subscription.id}:`, subscriptionError);
    return NextResponse.json(
      { error: "Failed to update subscription record" },
      { status: 500 }
    );
  }

  return null;
}
