import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { apiError } from "@/lib/api-error";
import { withRequestContext } from "@/lib/request-context";

export const revalidate = 3600;

export const GET = withRequestContext(async () => {
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    return apiError("Payment not configured", 500, "PAYMENT_CONFIGURATION_ERROR");
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount == null) {
      return apiError("Invalid premium price", 500, "INVALID_PREMIUM_PRICE");
    }
    return NextResponse.json({
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch price:", error);
    return apiError("Failed to fetch price", 500, "PRICE_FETCH_FAILED");
  }
});
