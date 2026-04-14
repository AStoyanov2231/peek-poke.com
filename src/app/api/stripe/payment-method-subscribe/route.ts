import { NextResponse } from "next/server";
import { withAuth, hasSubscriberRole } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const POST = withAuth(async (request, { user, supabase }) => {
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "Payment configuration error" }, { status: 500 });
  }

  const { paymentMethodId } = await request.json();
  if (!paymentMethodId) {
    return NextResponse.json({ error: "Missing paymentMethodId" }, { status: 400 });
  }

  // Check if already premium
  if (await hasSubscriberRole(supabase, user.id)) {
    return NextResponse.json({ error: "Already premium" }, { status: 400 });
  }

  // Get or create Stripe customer
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let customerId = profile.stripe_customer_id;

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    // Create subscription with this payment method
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      expand: ["latest_invoice.payment_intent"],
      metadata: { supabase_user_id: user.id },
    });

    // If subscription requires additional action (3DS)
    if (subscription.status === "incomplete") {
      const invoice = subscription.latest_invoice as { payment_intent?: { client_secret?: string } } | null;
      const clientSecret = invoice?.payment_intent?.client_secret;
      if (clientSecret) {
        return NextResponse.json({ clientSecret });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment method subscribe error:", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
});
