# Temporary Poke conversations

Implementation in progress, not activated in production.
The working duration is 24 hours after the latest accepted Poke.
This resolves the brief's temporary-conversation requirement without deleting readable history.

## Product behavior

- An accepted Poke opens or renews the pair's conversation for 24 hours.
- Accepted friendship makes the conversation ongoing.
- Existing legacy conversations with no accepted Poke retain their current behavior.
- Expiration preserves authorized message history and access to independently authorized Plans.
- Expiration prevents new messages, edits that deliver new content, new calls, typing broadcasts, and conversation-generated suggestions or venue requests.
- Read receipts, deletion of one's own messages, ending an existing call, account erasure, and reporting/blocking remain available where their existing authorization permits them.
- A new accepted Poke renews the conversation; merely sending a Poke does not.
- Draft text remains recoverable but is never sent automatically after renewal or friendship.
- Blocking, deleted accounts, and adult admission always take precedence over the conversation window.

## Enforcement and compatibility

The server must derive the window from stored accepted-Poke and friendship state.
Clients must not supply the acceptance time or decide whether writes are authorized.
The read-history permission stays separate from the permission to start a new interaction.
A versioned access endpoint carries the account and thread identity, basis, expiry, and server time without changing existing strict message-history responses.
Web and native must refresh access on focus and after relevant social changes, stop offering write actions at expiry, and recover from temporary access-check failures.
The database must enforce the same boundary for direct or delayed write attempts, with idempotent retries of already committed operations retaining their original result.
Calls that started within an active window may terminate normally after expiry, but expiry must not permit a new invitation or resurrect a completed call.

## Required proof

- [ ] Browser and native expired-state journeys retain history and drafts while hiding new interaction controls.
- [ ] Active Pokes, renewed Pokes, accepted friendships, and legacy conversations have the intended access state.
- [ ] Missing, malformed, mismatched-account, and stale access responses never enable writes.
- [ ] Database tests prove the exact expiry boundary, expired writes, accepted renewal, friendship removal, blocks, and adult admission.
- [ ] Message idempotency and terminal call cleanup still work across expiry.
- [ ] Save exact pre-migration function/trigger/grant state and rehearse the scoped rollback before production activation.
- [ ] Pass local gates, required CI, scoped hosted verification, and matching web/native runtime checks.

## Current verification

The local SQL harness passes 23 assertions against the proposed migration.
The shared/server/route checks pass 106 tests, including the exact shared-contract boundary, API denial, and exclusion of typing, provider, and call-broadcast side effects after expiry.
The browser checks cover readable history, hidden new-interaction controls, the new Poke dialog, expiry while composing, access failure, refreshed renewal, retained text, and zero message sends.
The native hook passes six platform tests for timer expiry, renewed access, failure with cached permission, and account-switch isolation.
These checks do not establish actual database RPC replay/concurrency behavior or packaged native runtime acceptance.
Production remains unchanged at 183 migrations, with no accepted Pokes currently present.
Release and operator prerequisites remain tracked in [PRODUCT_LAUNCH_BLOCKERS.md](../PRODUCT_LAUNCH_BLOCKERS.md).
