# Social access and location safety

## Product decision

Friend requests, accepting a request, direct messaging, standard profile photos, and joining ordinary plans are core network actions.
They must not require coins or a subscription.
Coins remain an earned balance for optional enhancements and verified meetup rewards.
Peek+ is reserved for optional power features such as advanced filters, travel mode, boosts, and profile customization.

Private photos remain private by their owner's choice.
They are never unlocked by a subscription.

## Server controls

The `20260908113140_free_social_graph_and_coarse_nearby.sql` migration retains the existing durable idempotency records, 20-per-minute friendship mutation limit, normalized pair locks, block checks, and outbox events.
It removes wallet debits and friend-count subscription limits from new social actions.
New free friend requests carry a durable zero-cost marker.
Pending requests created by the previous paid flow have no such marker, so their existing one-time, capped refund and ledger entry remain intact when removed.
Existing earned coin balances and verified meeting rewards are untouched.

The same migration returns nearby people in 0.01-degree display cells.
The follow-on `20260908113454_privacy_location_retention.sql` migration adds a service-only, lock-safe batch purge for coordinates older than ten minutes.
Its every-minute scheduler is configured and has recorded successful execution; [product operations](product-operations.md) tracks the remaining alerting and hosted recovery work.
Exact coordinates remain in `user_locations` for server-side matching and are never returned by discovery APIs.
Only a future server-verified device attestation may authorize a reward-bearing proximity claim.
Do not use client coordinates to grant rewards or disclose an exact friend location unless the user has explicitly shared it for a bounded period.

An accepted Poke or shared Plan supplies context for explicit mutual meetup acknowledgement.
Acknowledgement does not verify physical presence and does not award coins.
The reward-bearing proximity endpoint remains unavailable until a trusted presence mechanism is implemented and verified; [product verification](product-verification.md) records that separate prerequisite.

## Sharing a Plan with someone trusted

Any current participant in an active Plan can choose Share details on web or native, including after its start time.
The preview contains the activity/title, date and local time with timezone, place text, and attendee count.
The participant must separately choose Share or Copy details before anything leaves the preview.
The generated summary does not add an invitation link, internal identifiers, precise device coordinates, or other participants' names.
It retains the place text supplied for the Plan, so the preview allows the participant to review that information before disclosure.
Copy failure leaves selectable text available, and copying does not send a message automatically.
Host-created invitation links remain a separate Share invite action with the existing membership and revocation controls.

## Deployment and verification

The initial read-only hosted metadata confirmed that `create_or_find_thread` debited one coin for a new non-friend direct message.
The deployed migration replaced that function with a zero-cost path retaining its profile checks, normalized-pair lock, and block check.
[Progress.md](../Progress.md) records the subsequent hosted verification and release evidence.
For future changes, run concurrent request, accept, delete, block, and direct-message tests against explicitly authorized synthetic users, and verify that a zero-coin account can complete each core action without a wallet or coin-transaction change.

Test location privacy with repeated nearby requests and confirm that no response exposes more than two decimal places.
Keep exact-location disclosure and reward claims unavailable until their separate consent, trusted-provider, and device-verification requirements are satisfied.

## Research findings

The FTC's Kochava complaint describes precise geolocation data as sensitive and warns that it can reveal visits to sensitive locations, supporting coarse default discovery and purpose-limited exact location handling. [FTC announcement](https://www.ftc.gov/business-guidance/blog/2022/07/ftc-sues-kochava-data-broker-selling-sensitive-geolocation-data)

Apple exposes reduced-accuracy authorization for location and recommends apps request only the accuracy needed for the feature, supporting approximate nearby-map cells as the default. [Apple Core Location documentation](https://developer.apple.com/documentation/corelocation/cllocationmanager/3600215-accuracyauthorization)

OWASP MASVS treats location data as sensitive and calls for minimizing collection, retention, and exposure, supporting server-only exact coordinates, ten-minute discovery exclusion, and a scheduled physical-deletion follow-up. [OWASP MASVS](https://mas.owasp.org/MASTG/0x06d-Testing-Data-Storage/)
