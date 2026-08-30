import type { SupabaseClient } from "@supabase/supabase-js";

export type BillingProvider = "stripe";

export type EntitlementEvent = {
  userId: string;
  provider: BillingProvider;
  eventId: string;
  eventAt: Date;
  active: boolean;
  expiresAt: Date | null;
  productId: string | null;
};

export async function applyEntitlementEvent(
  supabase: SupabaseClient,
  event: EntitlementEvent
) {
  const { data, error } = await supabase.rpc("apply_billing_entitlement_event", {
    p_user_id: event.userId,
    p_provider: event.provider,
    p_event_id: event.eventId,
    p_event_at: event.eventAt.toISOString(),
    p_active: event.active,
    p_expires_at: event.expiresAt?.toISOString() ?? null,
    p_product_id: event.productId,
  });

  if (error) {
    console.error(`Failed to apply ${event.provider} entitlement event:`, error);
    return { ok: false, applied: false };
  }

  // A valid but older duplicate is intentionally ignored by the database and
  // is still a successfully handled webhook delivery.
  if (!data || typeof data !== "object") return { ok: false, applied: false };
  return { ok: true, applied: data.applied !== false };
}
