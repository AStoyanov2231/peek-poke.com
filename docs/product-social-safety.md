# Social access and location safety

## Product decision

Friend requests, accepting a request, direct messaging, standard profile photos, and joining ordinary plans are core network actions.
They must not require coins or a subscription.
Coins remain an earned balance for optional enhancements and verified meetup rewards.
Peek+ is reserved for optional power features such as advanced filters, travel mode, boosts, and profile customization.

Private photos remain private by their owner's choice.
They are never unlocked by a subscription.

## Server controls

The `20260908010000_free_social_graph_and_coarse_nearby.sql` migration retains the existing durable idempotency records, 20-per-minute friendship mutation limit, normalized pair locks, block checks, and outbox events.
It removes wallet debits and friend-count subscription limits from new social actions.
New free friend requests carry a durable zero-cost marker.
Pending requests created by the previous paid flow have no such marker, so their existing one-time, capped refund and ledger entry remain intact when removed.
Existing earned coin balances and verified meeting rewards are untouched.

The same migration returns nearby people in 0.01-degree display cells.
The follow-on `20260908060000_privacy_location_retention.sql` migration adds a service-only, lock-safe batch purge for coordinates older than ten minutes; its scheduler must be configured before release.
Exact coordinates remain in `user_locations` for server-side matching and are never returned by discovery APIs.
Only a future server-verified device attestation may authorize a reward-bearing proximity claim.
Do not use client coordinates to grant rewards or disclose an exact friend location unless the user has explicitly shared it for a bounded period.

An accepted Poke and active, time-bounded shared Plan are valid social contexts for recording a meetup.
The server still rejects blocks, stale locations, and pairs beyond its exact 50-meter threshold before it records the canonical pair or awards an earned coin.
The one-kilometer client candidate radius only compensates for coarse display-cell error and cannot authorize or widen a reward.

## Deployment and verification

Read-only hosted metadata confirmed that `create_or_find_thread` currently debits one coin for a new non-friend direct message.
The migration replaces that exact function signature with a zero-cost path that retains its profile checks, normalized-pair lock, and block check.
Before promotion, apply the migration to an isolated copy of the hosted baseline.
Run concurrent request, accept, delete, block, and direct-message tests against synthetic users, then verify that a 0-coin account can complete each core action without a wallet or coin-transaction change.

Test location privacy with repeated nearby requests and confirm that no response exposes more than two decimal places.
Keep exact location disabled unless an attestation provider is live and a device-level test has passed.

## Research findings

The FTC's Kochava complaint describes precise geolocation data as sensitive and warns that it can reveal visits to sensitive locations, supporting coarse default discovery and purpose-limited exact location handling. [FTC announcement](https://www.ftc.gov/business-guidance/blog/2022/07/ftc-sues-kochava-data-broker-selling-sensitive-geolocation-data)

Apple exposes reduced-accuracy authorization for location and recommends apps request only the accuracy needed for the feature, supporting approximate nearby-map cells as the default. [Apple Core Location documentation](https://developer.apple.com/documentation/corelocation/cllocationmanager/3600215-accuracyauthorization)

OWASP MASVS treats location data as sensitive and calls for minimizing collection, retention, and exposure, supporting server-only exact coordinates, ten-minute discovery exclusion, and a scheduled physical-deletion follow-up. [OWASP MASVS](https://mas.owasp.org/MASTG/0x06d-Testing-Data-Storage/)
