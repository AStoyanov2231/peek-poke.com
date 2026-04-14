import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const POST = withAuth(async (_request, { user, supabase }) => {
  const { data: subscription, error: queryError } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (queryError) {
    console.error("stripe/portal:", queryError);
    return NextResponse.json({ error: "Failed to look up subscription" }, { status: 500 });
  }

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("stripe/portal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
