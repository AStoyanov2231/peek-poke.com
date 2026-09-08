/**
 * Product lifecycle events deliberately exclude account IDs, free text, place
 * labels, coordinates, and timestamps supplied by a client. Vercel captures
 * these structured server logs in production; local/test execution is inert.
 */
export type ProductEventName =
  | "availability_created"
  | "poke_sent"
  | "poke_accepted"
  | "plan_created"
  | "meet_created";

type ProductEvent = Readonly<{
  name: ProductEventName;
  activity?: string;
  visibility?: string;
}>;

export function trackProductEvent(event: ProductEvent) {
  if (process.env.NODE_ENV === "test") return;
  // A fixed envelope makes log queries reliable and prevents accidental raw
  // request serialization if callers add fields in the future.
  const safe = {
    type: "product_event" as const,
    name: event.name,
    ...(event.activity ? { activity: event.activity } : {}),
    ...(event.visibility ? { visibility: event.visibility } : {}),
  };
  console.info(JSON.stringify(safe));
}
