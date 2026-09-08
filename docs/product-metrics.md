# Product funnel metrics

`20260908113529_private_product_funnel_metrics.sql` provides a service-only, daily aggregate for a maximum of 31 UTC days.
It returns only counts for durable social activation, current availability records created, Pokes sent and accepted, Plans created, Plans created from accepted-Poke threads, successful Plan joins, and mutually acknowledged meetups.

The aggregate reads durable domain records and idempotency records.
It stores and returns no account identifiers, names, messages, notes, locations, or client-supplied timestamps.

Activation means a user's first durable social action: sent Poke, created Plan, successful Plan join, or mutual acknowledgement.
`current_availability_records_created` is a mutable-table snapshot metric rather than a lifetime event count: clearing availability deletes its row and later updates preserve its original creation time.
A Plan counts as Poke-derived only when its source thread belongs to an accepted Poke that predates the Plan.
A mutual meetup is an explicit social acknowledgement, not proof of physical presence, an award, or a Plan-attributed conversion.

`product_weekly_social_activity_metrics` counts weekly socially active accounts and repeat-week socially active accounts over the same bounded 31-day window.
Social activity is a sent or responded-to Poke, a created or successfully joined Plan, or a mutual acknowledgement.
Passive readers are excluded because the current domain schema does not retain a durable read event.

`20260908113628_private_product_activity_metrics.sql` adds a separate, service-only activity input for the metrics that cannot be reconstructed from mutable availability rows.
The first availability activation or Poke activation is recorded once per account and is preserved when availability is edited or cleared.
Successful availability reads record only the returned opportunity counts within 2 km, 10 km, and 25 km, using the server-calculated `distanceKm` values.
The daily records hold no message, name, location, or coordinate content.
The service-only cleanup RPC removes records older than the configured 31-day window when invoked; its scheduler and monitoring are release prerequisites.
Weekly active accounts include availability activation, Poke activation, and successful discovery activity.
`20260908113639_plan_meetup_attribution.sql` records an explicit, separate confirmation for a specific Plan and participant pair.
It does not alter or infer from generic pair-day meetup acknowledgements.
The confirmation window opens at the Plan start time and closes 48 hours later.
Both live accounts must still be current Plan members, the Plan must remain active, and either-direction blocks remove the peer from the response and deny a confirmation.
`plan_confirmation_started_pairs` is the daily count of distinct Plan participant pairs for which the first explicit confirmation was submitted.
`plan_to_mutual_confirmed` is the daily count of Plan participant pairs whose second confirmation made the record mutual.
These are event counts, not a conversion-rate numerator and denominator, because a first confirmation and its mutual completion can fall on different UTC days.

`product_plan_conversion_metrics` is the service-only Plan conversion cohort aggregate.
Its denominator is every Plan whose scheduled UTC start falls within the requested start-day cohort, regardless of later cancellation.
Its numerator counts each such Plan once when at least one explicit Plan-scoped confirmation becomes mutual, even if the Plan has multiple confirmed participant pairs.
`confirmation_window_closed` is true only after the cohort day's end plus the 48-hour confirmation window.
The conversion rate is null for an empty cohort.
