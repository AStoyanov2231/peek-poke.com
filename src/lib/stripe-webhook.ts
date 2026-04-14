import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import type { RoleName } from "@/types/database";
import { isValidUUID } from "@/lib/validation";

type ServiceClient = ReturnType<typeof createServiceClient>;

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const fallback = Math.floor(Date.now() / 1000);
  return {
    start: item?.current_period_start ?? fallback,
    end: item?.current_period_end ?? fallback,
  };
}

async function grantRole(
  supabase: ServiceClient,
  userId: string,
  roleName: RoleName
): Promise<boolean> {
  const { error } = await supabase.rpc("grant_role", {
    p_user_id: userId,
    p_role_name: roleName,
  });
  if (error) {
    console.error(`Failed to grant role '${roleName}' to user ${userId}:`, error);
    return false;
  }
  return true;
}

async function revokeRole(
  supabase: ServiceClient,
  userId: string,
  roleName: RoleName
): Promise<boolean> {
  const { error } = await supabase.rpc("revoke_role", {
    p_user_id: userId,
    p_role_name: roleName,
  });
  if (error) {
    console.error(`Failed to revoke role '${roleName}' from user ${userId}:`, error);
    return false;
  }
  return true;
}

function missingUserResponse() {
  return NextResponse.json({
    received: true,
    warning: "Missing user metadata - requires manual reconciliation",
  });
}

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: ServiceClient
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

  const roleGranted = await grantRole(supabase, userId, "subscriber");
  if (!roleGranted) {
    console.error(`Critical: Failed to grant subscriber role to user ${userId} after checkout.session.completed`);
    return NextResponse.json(
      { error: "Failed to grant subscriber role" },
      { status: 500 }
    );
  }

  return null;
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: ServiceClient
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

  const { error: updateError } = await supabase
    .from("subscriptions")
    .update({
      status: subscription.status,
      current_period_end: new Date(periodEnd * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (updateError) {
    console.error(`Failed to update subscription record for ${subscription.id}:`, updateError);
    return NextResponse.json(
      { error: "Failed to update subscription record" },
      { status: 500 }
    );
  }

  const success = isActive
    ? await grantRole(supabase, userId, "subscriber")
    : await revokeRole(supabase, userId, "subscriber");
  if (!success) {
    console.error(`Critical: Failed to ${isActive ? "grant" : "revoke"} subscriber role for user ${userId} on subscription update`);
    return NextResponse.json(
      { error: `Failed to ${isActive ? "grant" : "revoke"} subscriber role` },
      { status: 500 }
    );
  }

  return null;
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: ServiceClient
): Promise<NextResponse | null> {
  const userId = subscription.metadata.supabase_user_id;
  if (!userId || !isValidUUID(userId)) {
    console.error("customer.subscription.deleted: Missing/invalid supabase_user_id in subscription metadata", {
      subscriptionId: subscription.id,
    });
    return missingUserResponse();
  }

  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (subscriptionError) {
    console.error(`Failed to update subscription record for ${subscription.id}:`, subscriptionError);
    return NextResponse.json(
      { error: "Failed to update subscription record" },
      { status: 500 }
    );
  }

  const roleRevoked = await revokeRole(supabase, userId, "subscriber");
  if (!roleRevoked) {
    console.error(`Critical: Failed to revoke subscriber role from user ${userId} on subscription deletion`);
    return NextResponse.json(
      { error: "Failed to revoke subscriber role" },
      { status: 500 }
    );
  }

  return null;
}
