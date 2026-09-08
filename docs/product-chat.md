# Chat, Pokes, Plans, and Circles

The inbox is organized around the social loop: Poke, chat, plan, and meet.

## Pokes

Pokes are lightweight invitations with an activity and expiry.

The Pokes inbox shows received invitations first.

Members can accept, reply later, or decline.

Accepting creates or reuses a direct-message thread atomically, then opens that thread.
Creation and acceptance enqueue identifier-only outbox events in the same transaction.
The worker rechecks block, expiry, account, and conversation state before generic push and private realtime delivery.
Clients derive allowlisted destinations from typed identifiers; thirty-second polling remains a recovery path.

The UI does not invent a sender name, distance, venue, or availability statement because the Poke contract does not provide those facts.

## Chat

Chat keeps the existing reliable message-send, reply, edit, media, typing, and read-receipt lifecycle.

The "Move it forward" suggestions use bounded, server-authorized Poke, intent, shared-interest, and Plan context.
The deterministic provider is rate-limited and never interprets message content as instructions.

Choosing a suggestion only places it in the composer.

It never sends a message automatically and is not presented as generated intelligence.

The Make a plan action opens a short form in the conversation context.
Optional Google Places cards offer Suggest place and Meet here actions; these fill an editable message or Plan form.
The provider receives only a coarse midpoint after active membership, blocks, reciprocal discovery visibility, and location freshness checks.
Provider setup and unavailable states are documented in [Chat venue suggestions](chat-venues.md).

## Plans

A plan has an activity, future time, named place or area, visibility, participant limit, and optional source message thread.

The shared `PlanComposerDialog` is the single web entry point for creating plans from an inbox or chat.

It uses `POST /api/plans` and includes `source_thread_id` when created from a direct-message thread.

Plans are shown in the inbox in chronological order.
Private is the default audience, and nearby publication requires an explicit current-area opt-in.
Open Plans without that opt-in remain shareable through deliberate invitations.
Interrupted creation retries preserve the same request body and idempotency key on web and native.

Authenticated plan detail is available at `/plans/[planId]`.

It supports joining, owner-only edits and cancellation, a generated share link, and a QR code that points to the public plan preview.

Members can leave a plan after an explicit confirmation.

Owners cancel plans instead of leaving them and can explicitly revoke every public share link.

Plan members receive safe display names and avatars for confirmed attendees.
The originating conversation is exposed only to viewers who belong to it.

## Circles and Scan

The persisted API terminology remains `groups` for compatibility.

The member-facing language is Circle.

Circles appear alongside direct messages because their job is fast local coordination, not a separate feed.

Scan is the contextual path for joining a Circle, plan, or connection after meeting.

## Meeting acknowledgement

Eligible direct conversations offer an explicit We met confirmation independently of GPS.
The first participant records only their own acknowledgement.
The other participant must separately confirm, and the read contract distinguishes who is still waiting.
The current private state refreshes after mutations and every thirty seconds, so a durable replay of an earlier waiting response does not freeze the UI.
The confirmed state offers another Plan.

This feature does not prove physical presence or award coins.
Reward-bearing proximity remains unavailable until a supported attestation provider is integrated and tested.
Accepted friendships, accepted Pokes, and bounded shared Plans are recognized social contexts; none bypass block or reward-proof checks.
