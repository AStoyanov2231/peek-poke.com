import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET() {
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "Payment not configured" }, { status: 500 });
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    return NextResponse.json({
      amount: price.unit_amount ?? 999,
      currency: price.currency,
    });
  } catch (error) {
    console.error("Failed to fetch price:", error);
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
