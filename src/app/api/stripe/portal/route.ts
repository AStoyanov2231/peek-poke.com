import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (_request, { user }) => {
  const limited = await enforceRateLimit("billing", user.id);
  if (limited) return limited;

  const { data: subscription, error: queryError } = await createServiceClient()
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (queryError) {
    console.error("stripe/portal:", queryError);
    return apiError("Failed to look up subscription", 500, "SUBSCRIPTION_LOOKUP_FAILED");
  }

  if (!subscription?.stripe_customer_id) {
    return apiError("No subscription found", 400, "SUBSCRIPTION_NOT_FOUND");
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/premium`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("stripe/portal:", error);
    return apiError("Internal server error", 500, "BILLING_PORTAL_FAILED");
  }
});
