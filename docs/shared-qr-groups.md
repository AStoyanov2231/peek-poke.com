# Shared QR groups

## Payload semantics

A scan submits the exact decoded QR string as `qr_content`. The server accepts 1-4,096 characters, rejects empty, over-limit, or NUL-containing input, and computes the SHA-256 digest of its UTF-8 bytes. It does not trim, normalize Unicode, fold case, parse URLs, fetch content, execute content, or navigate to content. The digest is the only persisted group identity. Therefore the same decoded string intentionally maps to the same group everywhere, while different strings remain isolated. A QR scan is public discoverability, not proof of physical presence or a private invitation.

The raw decoded string is not stored, returned, logged, shown as a group name, or included in analytics. Groups use the safe literal label `Shared group`.

A newly joined member can read the existing conversation history, matching the shared-conversation model. The scanner copy makes the public discoverability rule explicit: anyone who has the same decoded text can join.

## Server behavior

The additive migration `supabase/migrations/20260814000000_shared_qr_groups.sql` creates the group, membership, message, and outbox tables. The guarded follow-up migration `supabase/migrations/20260906000000_correct_account_erasure_coalesce.sql` corrects the approved account-erasure function before rollout. The `create_or_join_shared_group` RPC performs digest lookup, creation, and membership insertion in one security-definer transaction. The unique digest and conflict-safe insert make concurrent first scans converge on one group. Membership and message writes are idempotent. RLS denies direct client table access; the authenticated API routes authorize membership before reads and the message RPC authorizes every send. Account erasure removes the deleting member's group messages and membership while preserving other members' history and membership. Outbox delivery leases remain held until completion; erasure returns a retryable blocked result while delivery is unresolved, with no automatic stale-lease reclamation or third-party notification recall guarantee.

Apply the migrations through the normal isolated Supabase project migration workflow before enabling the clients. Do not run it directly against production without the project's migration approval and deployment process.

## Client support

The web map opens a browser camera scanner when `BarcodeDetector` and `getUserMedia` are available, and always provides an exact-text fallback for unsupported browsers or denied permission. The Expo map uses `expo-camera` QR callbacks with an exact-text fallback. Adding `expo-camera` and its config plugin requires a new native dev/release build; JavaScript-only reloads are not sufficient for that client change.

Both inboxes merge shared groups with direct messages, preserve last-activity ordering and unread counts, and route to a text-capable group conversation. Group messages use the existing private per-user realtime hint channel and server outbox worker, while the durable API remains authoritative.
