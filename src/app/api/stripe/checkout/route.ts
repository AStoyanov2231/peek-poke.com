import { NextResponse } from "next/server";
import { withAuth, hasSubscriberRole } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (_request, { user, supabase }) => {
  const limited = await enforceRateLimit("billing", user.id);
  if (limited) return limited;

  const serviceClient = createServiceClient();
  // Validate price ID early
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    console.error("STRIPE_PREMIUM_PRICE_ID is not configured");
    return apiError("Payment configuration error", 500, "PAYMENT_CONFIGURATION_ERROR");
  }

  // Get or create Stripe customer
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id, username")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("Failed to fetch profile:", profileError);
    return apiError("Profile not found", 404, "USER_NOT_FOUND");
  }

  // Check if user already has subscriber role
  if (await hasSubscriberRole(supabase, user.id)) {
    return apiError("Already premium", 400, "ALREADY_PREMIUM");
  }

  let customerId = profile.stripe_customer_id;

  try {
    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Save customer ID to profile
      const { error: saveError } = await serviceClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (saveError) {
        console.error("Failed to save Stripe customer ID:", saveError);
        return apiError("Failed to set up payment", 500, "PAYMENT_SETUP_FAILED");
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/premium?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/premium?payment=canceled`,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      payment_method_options: {
        card: {
          request_three_d_secure: "automatic",
        },
      },
      // Enable wallet payment methods (Google Pay, Apple Pay)
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return apiError("Failed to create checkout session", 500, "CHECKOUT_SESSION_FAILED");
  }
});
