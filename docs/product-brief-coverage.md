# Product brief coverage

Reviewed against all 34 top-level sections of [PRODUCT-REDESIG.md](../PRODUCT-REDESIG.md) on 2026-09-09.
Release identifiers and verification status are recorded in [Progress.md](../Progress.md).
This assessment preserves the brief's intended product scope and distinguishes working features from pending implementation, product decisions, and provider or device evidence.
Illustrative examples and explicitly long-term ideas are identified as such instead of silently becoming launch requirements.

Implemented means the described source and focused tests exist.
The evidence column identifies where execution was verified; it does not imply that every platform or provider path is proven.
Partial means material behavior from the section still needs implementation or activation.

| Brief section | Assessment | Evidence and remaining work |
| --- | --- | --- |
| 1. Core product concept | Implemented core loop | Now, contextual Pokes, chat, Plans, and mutual meetup acknowledgement work in browser fixtures and the Simulator; deployed social APIs pass. |
| 2. Replace Add Friend as the primary action | Partial | Poke is primary and acceptance opens free chat atomically; a 24-hour window is implemented and verified locally on web/native and PostgreSQL, with history and drafts retained; production activation remains pending in PR #17. |
| 3. Temporary availability / intent | Implemented | Shared availability contracts, web/native editors, expiry, cancellation, and stale-location filtering are tested; expired availability is hidden even when refresh fails. |
| 4. Now screen | Implemented | [NowPage](../src/features/now/components/NowPage.tsx) and native Now show intent, ranked people, friends, Plans, and Circles; the versioned discovery route passed deployed verification. |
| 5. Map | Implemented selected scope | Activity-aware coarse pins, clusters, selected cards, and stable neighborhood context exist; group/Plan pins were illustrative suggestions and are not currently rendered. |
| 6. AI-assisted chat | Partial activation | Editable deterministic suggestions and an optional bounded external adapter exist in [suggestions.ts](../src/features/chat/server/suggestions.ts); model and Places providers need configuration, privacy review, and live fallback proof. |
| 7. Plans | Implemented | [PlanDetailPage](../src/features/plans/components/PlanDetailPage.tsx), native detail, membership, capacity, audience, share revocation, recent Plans, and explicit acknowledgement are tested locally and through scoped deployed APIs. |
| 8. QR / Scan | Implemented launch scope | Profile, signed invitation, Plan, and existing Circle payloads are supported; venue check-in is explicitly long term, and OS-level links still need signed-device verification. |
| 9. Circles | Implemented | Existing groups remain available as lightweight recurring coordination, with contextual Plan creation and audience rules. |
| 10. Coins | Partial implementation | Core social actions are free and unsafe location rewards are disabled; reward verification and optional earn/spend benefits are not implemented end to end. |
| 11. Meeting detection | Partial implementation | Private two-party acknowledgement works in direct chat and Plans; it records explicit confirmation, not verified physical presence, and issues no coins. |
| 12. Onboarding | Implemented | Identity, interests, optional intent, location explanation/denial recovery, and return to Now work in fixture browser and Simulator journeys; adult admission precedes social access. |
| 13. Empty states | Implemented | Quiet discovery offers radius expansion, Plan creation, invitations, and Scan without inventing people; failures offer retry and preserve useful state. |
| 14. Growth and sharing | Implemented source | [PublicPlanPage](../src/features/plans/components/PublicPlanPage.tsx) previews the invitation before authentication and preserves it through explicit join; signed mobile link proof remains open. |
| 15. Premium redesign | Partial implementation | Free essentials and existing subscription management are preserved; new sales stay disabled until optional paid benefits exist and storefront eligibility is confirmed; suggested prices are hypotheses. |
| 16. Safety and privacy | Implemented controls; operations pending | Blocking, reporting, adult admission, discovery audiences, coarse location, private media, and erasure boundaries are tested; operator contact, moderation process, and physical/provider proof remain open. |
| 17. UI redesign | Implemented visual direction | Cream, coral, sage, typography, action hierarchy, shared tokens, responsive layouts, and reduced motion are implemented; desktop/mobile web and key Simulator surfaces were inspected. |
| 18. Recognizable visual language | Implemented selected direction | The open-circle identity and shared visual tokens establish the product language; suggested ripples, auras, and other decorative treatments are alternatives, not cumulative requirements. |
| 19. Typography and spacing | Implemented | Shared web/native tokens, readable activity cards, explicit labels, and 44-point native controls are verified through tests and visual review; physical accessibility testing remains open. |
| 20. Color | Implemented | Semantic coral actions, sage availability, cream surfaces, and ink text are shared across core flows; a separate dark theme was conditional in the brief. |
| 21. Profile cards | Implemented | Intent, expiry, coarse distance, authorized connection context, and Poke take priority; final desktop/mobile discovery cards were inspected after CI passed. |
| 22. Inbox redesign | Implemented | Pokes, Plans, and Messages have clear priority and state; native Poke acceptance clears the pending badge and opens the authorized conversation. |
| 23. AI suggestions UI | Implemented UI; providers pending | [ChatMomentumActions](../src/features/chat/components/ChatMomentumActions.tsx) and native composer suggestions fill editable drafts without sending; venue cards require the optional Places provider. |
| 24. Profile | Implemented | Availability, shared Circles, authorized Plans, meetup acknowledgement context, privacy, and Settings are present; direct native privacy save/reopen now passes in XCTest. |
| 25. Public landing page | Implemented | The landing page explains Peek, Poke, and Meet, provides acquisition and safety routes, and labels its example Plan honestly; public and responsive checks pass. |
| 26. Initial market assumptions | Product hypothesis | Low-density behavior is implemented; city/community selection and actual launch density require an operator-led launch, not fabricated users or metrics. |
| 27. Metrics / analytics | Partial outcome measurement | Private activation, availability, Poke, Plan, and mutual-confirmation aggregates exist; mutual confirmation is a proxy, not verified real-world connections per weekly active user. |
| 28. Implementation approach | Implemented practice | Shared DTOs, server authorization, additive migrations, legacy preservation, versioned discovery, required CI, and scoped hosted verification protect compatibility. |
| 29. Coherent vertical slices | Partial scope completion | Discovery, Pokes, Plans, and acknowledgement ship together; temporary-chat release, trusted reward verification, paid benefits, and provider activation remain unfinished slices. |
| 30. Quality requirements | Verified within stated environments | Loading, empty/error/retry, idempotency, concurrency, privacy, and accessibility have focused evidence; local retention load and direct native privacy now pass, while physical-device and hosted capacity proof remain open. |
| 31. Responsive behavior | Implemented; device proof pending | Shared concepts adapt to desktop, mobile web, and native navigation; browser and Simulator evidence does not replace physical iOS/Android testing. |
| 32. Existing features | Preserved and repositioned | Map, Circles, chat, profiles, Scan, calls, and subscription management remain; core paid gates are removed, unavailable rewards are hidden, and the new temporary-conversation lifecycle awaits production activation. |
| 33. Decision-making authority | Applied | Routine design and engineering decisions proceed autonomously; unselected support contacts, paid providers, trusted-presence policy, and the documented 24-hour working default remain visible. |
| 34. Desired result | Core loop works; full goal open | People can express intent, discover context, Poke, chat, arrange a Plan, and mutually acknowledge a meetup; trusted physical recognition, optional paid features, and launch operations still need completion. |

## Meeting integrity boundary

The reward endpoint is intentionally unavailable in [coins/meeting/route.ts](../src/app/api/coins/meeting/route.ts).
The current [capability predicate](../packages/shared/src/meeting-reward-capability.ts) is a disabled gate, not an implemented verification system.
The existing database award function has useful social, block, freshness, proximity, pair-idempotency, and wallet-lock checks, but its coordinates originate from client updates.
Apple App Attest validates an app-instance key and challenge-bound assertions; it does not certify GPS truth. [Apple server validation](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server)
Play Integrity validates app/device signals and request binding; its verdict has no trusted physical-location evidence. [Standard requests](https://developer.android.com/google/play/integrity/standard), [verdict fields](https://developer.android.com/google/play/integrity/verdicts)
A future reward design needs a chosen evidence mechanism, explicit abuse assumptions, server challenge and verification adapters, replay state, binding to both participants, and atomic award consumption.
App integrity must not be relabeled as trusted physical proximity.
The implementation and physical proof remain separate unchecked requirements in [PRODUCT_LAUNCH_BLOCKERS.md](../PRODUCT_LAUNCH_BLOCKERS.md).

## Evidence and next decisions

[Product verification](product-verification.md) records the test environments and their limits.
[Progress.md](../Progress.md) records releases and chronological work.
[SUPABASE_ROLLBACK.md](../SUPABASE_ROLLBACK.md) describes the exact private migration recovery package and distinguishes it from a full hosted restore.
The pending user decisions are a support/privacy contact, an approved monitoring destination, while the accepted-Poke lifetime currently uses the documented 24-hour implementation default.
Signed-device distribution, isolated service environments, provider setup, and full recovery evidence remain operational prerequisites.
Unimplemented rewards and paid benefits remain product work, not merely external configuration tasks.
