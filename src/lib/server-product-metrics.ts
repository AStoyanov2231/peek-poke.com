import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const METRICS_TIMEOUT_MS = 2_000;

type DiscoveryPerson = Readonly<{ distanceKm: number }>;

type ProductMetricsRpc =
  | "record_product_discovery_v1"
  | "record_product_activation_v1";

function scheduleMetricsRpc(
  procedure: ProductMetricsRpc,
  parameters: Record<string, number | string>,
) {
  after(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), METRICS_TIMEOUT_MS);

    try {
      const { error } = await createServiceClient()
        .rpc(procedure, parameters)
        .abortSignal(controller.signal);

      // Product metrics are best effort. The request that produced the event has
      // already succeeded, and neither database errors nor timeouts should alter it.
      if (error) return;
    } catch {
      // Do not log raw database errors or account identifiers from analytics work.
    } finally {
      clearTimeout(timeout);
    }
  });
}

export function recordProductMetrics(
  userId: string,
  people: readonly DiscoveryPerson[],
) {
  const withinTwoKm = people.filter((person) => person.distanceKm <= 2).length;
  const withinTenKm = people.filter((person) => person.distanceKm <= 10).length;
  const withinTwentyFiveKm = people.filter(
    (person) => person.distanceKm <= 25,
  ).length;

  scheduleMetricsRpc("record_product_discovery_v1", {
    p_user_id: userId,
    p_2: withinTwoKm,
    p_10: withinTenKm,
    p_25: withinTwentyFiveKm,
  });
}

export function recordAvailabilityActivation(userId: string) {
  scheduleMetricsRpc("record_product_activation_v1", {
    p_user_id: userId,
    p_source: "availability",
  });
}
