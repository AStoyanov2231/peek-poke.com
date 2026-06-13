# Calling (WebRTC)

> Peer-to-peer 1:1 audio/video calls between DM thread participants, signaled over Supabase Realtime broadcast (no media server, no calls table).

## How it works

A call is a fully peer-to-peer `RTCPeerConnection` between the two participants of a DM thread. There is **no calls table** — the `callId` is a client-generated `crypto.randomUUID()` (`src/components/sheet/ChatSheetContent.tsx:212`) and all call state is ephemeral, living only in `callStore` (web) and in two transient Supabase Realtime broadcast channels. The only server involvement is the call route (`src/app/api/dm/[threadId]/call/route.ts`), which relays ring/cancel/reject events via the service-role broadcast API and fires the incoming-call push.

Two channels are used (`src/lib/webrtc/signaling.ts:4-8`):

- **Ring channel** `calls:user:<recipientId>` — server→client only. Carries `ring-invite` events (`invite` / `cancel`). The callee subscribes to its own personal ring channel via `useIncomingCall` (`src/hooks/useIncomingCall.ts:33-35`).
- **Per-call channel** `call:<threadId>` — both peers, client-direct. Carries `call-signal` events: `accept`, `reject`, `offer`, `answer`, `ice`, `end` (`src/lib/webrtc/signaling.ts:20-26`).

Lifecycle (caller = outgoing, callee = incoming):

1. **Initiate** — caller taps call in the chat sheet; `handleStartCall` mints a `callId` and calls `startOutgoingCall` (`src/components/sheet/ChatSheetContent.tsx:210-219`), which sets `activeCall` (status `calling`) and mounts `CallView` → `useWebRTCCall`.
2. **Caller setup** — caller acquires media, builds the PC, subscribes to `call:<threadId>`. On `SUBSCRIBED` it POSTs `{action:"invite", callId}` to the call route (`src/hooks/useWebRTCCall.ts:316-321`) and arms a 30s ring timeout (`useWebRTCCall.ts:336-345`).
3. **Ring** — the route broadcasts `invite` to `calls:user:<recipientId>` and fires a best-effort push (`route.ts:83-99`). `useIncomingCall` receives it and sets `incomingInvite` → `IncomingCallOverlay` renders (`useIncomingCall.ts:39-61`).
4. **Accept** — callee taps accept → `acceptCall` promotes the invite to `activeCall` (direction `incoming`, status `connecting`) (`callStore.ts:60-73`), mounting its own `useWebRTCCall`. On `SUBSCRIBED` the callee sends `accept` on the call channel (`useWebRTCCall.ts:311-313`).
5. **Offer/answer** — the caller, on receiving `accept`, creates the offer, sets local description, sends `offer` (`useWebRTCCall.ts:222-236`). The callee sets remote description, flushes its ICE queue, creates and sends `answer` (`useWebRTCCall.ts:238-256`). The caller applies the `answer` (`useWebRTCCall.ts:258-271`).
6. **ICE** — trickle candidates flow both ways as `ice` events; each side queues candidates until `setRemoteDescription` lands, then flushes (`useWebRTCCall.ts:184-187`, `273-285`, `93-102`).
7. **Connected** — `onconnectionstatechange === "connected"` sets status `connected` (`useWebRTCCall.ts:190-193`); the call timer starts.
8. **Hangup** — either side's `endCall` sends `end`, tears down, and clears the store (`useWebRTCCall.ts:442-446`). The peer's `end`/`reject` handler does the same (`useWebRTCCall.ts:288-292`).

```mermaid
sequenceDiagram
    participant Caller as Caller (useWebRTCCall, outgoing)
    participant Route as POST /api/dm/[threadId]/call
    participant Ring as calls:user:&lt;callee&gt; (Realtime)
    participant Call as call:&lt;threadId&gt; (Realtime)
    participant Callee as Callee (useIncomingCall → useWebRTCCall, incoming)

    Caller->>Caller: getUserMedia + new RTCPeerConnection
    Caller->>Call: subscribe
    Caller->>Route: POST {action:invite, callId}
    Route->>Ring: broadcast ring-invite{invite}
    Route-->>Callee: push notification (best-effort)
    Ring->>Callee: invite → setIncomingInvite (overlay)
    Callee->>Callee: acceptCall() → mount useWebRTCCall (incoming)
    Callee->>Call: subscribe
    Callee->>Call: accept
    Call->>Caller: accept → createOffer
    Caller->>Call: offer (sdp)
    Call->>Callee: offer → setRemoteDescription + createAnswer
    Callee->>Call: answer (sdp)
    Call->>Caller: answer → setRemoteDescription
    par Trickle ICE (both directions)
        Caller->>Call: ice candidate
        Call->>Callee: ice candidate
        Callee->>Call: ice candidate
        Call->>Caller: ice candidate
    end
    Note over Caller,Callee: connectionState = connected → status "connected"
    Caller->>Call: end (on hangup)
    Call->>Callee: end → cleanup + clearCall
```

## Signaling

**Transport:** Supabase Realtime broadcast. No `calls` table is persisted; SDP and ICE are exchanged as transient broadcast payloads only.

**Client→client (per-call):** `useWebRTCCall` subscribes to `supabase.channel("call:<threadId>", { config: { broadcast: { self: false } } })` and sends via `channel.send({ type: "broadcast", event: "call-signal", payload })` (`useWebRTCCall.ts:204-207`, `88-90`). `self: false` means a peer never receives its own broadcasts. Message types are the `SignalingEvent` union (`signaling.ts:20-26`); every event carries the `callId`, and the receiver drops events whose `callId` doesn't match (`useWebRTCCall.ts:216`) to ignore stale rings.

**Server→client (ring + reject):** the call route broadcasts using the service-role Realtime HTTP API `POST <SUPABASE_URL>/realtime/v1/api/broadcast` (`route.ts:52-65`). `invite`/`cancel` go to `calls:user:<recipientId>` as `ring-invite`; `reject` goes to `call:<threadId>` as `call-signal` (`route.ts:67-113`). Note: `accept`, `offer`, `answer`, `ice`, and `end` are sent **directly peer-to-peer** by the clients — only `invite`, `cancel`, and `reject` route through the server (because the callee isn't subscribed to the call channel until it accepts, and the ring channel is server-authoritative).

**Offer/answer/candidate ordering:** the caller does **not** create an offer up front; it waits for `accept` before `createOffer` (`useWebRTCCall.ts:222-229`). This avoids generating SDP before the callee is even on the channel.

**ICE servers** (`src/lib/webrtc/iceServers.ts`): `getIceServers()` returns Google STUN (`stun:stun.l.google.com:19302`) by default, overridable via `NEXT_PUBLIC_STUN_URLS`. A TURN relay is added only if all three of `NEXT_PUBLIC_TURN_URL` / `NEXT_PUBLIC_TURN_USERNAME` / `NEXT_PUBLIC_TURN_CREDENTIAL` are set (`iceServers.ts:20-30`). See [Gotchas](#gotchas--invariants) for the TURN credential caveat.

## Call state machine

`callStore` (`src/stores/callStore.ts`) is a Zustand store holding two nullable slices: `activeCall` and `incomingInvite`. Non-serializable WebRTC objects (the `RTCPeerConnection`, `MediaStream`s, the channel) live in refs inside `useWebRTCCall`, never in the store (`useWebRTCCall.ts:58-68`).

`CallStatus` (`callStore.ts:5-10`): `calling` → `connecting` → `connected`, plus terminal `ended` and `failed`.

Transitions:

| Action | Who calls it | Effect |
|---|---|---|
| `startOutgoingCall` | caller, `ChatSheetContent` (`:213`) | sets `activeCall` (outgoing, `calling`); clears any invite (`callStore.ts:52-56`) |
| `setIncomingInvite` | `useIncomingCall` on `invite` (`:57`) | sets `incomingInvite` → overlay |
| `acceptCall` | callee, `IncomingCallOverlay` (`:49`) | promotes invite → `activeCall` (incoming, `connecting`); clears invite (`callStore.ts:60-73`) |
| `declineCall` | callee, `IncomingCallOverlay` (`:46`) | clears invite (server already sent `reject`) |
| `setCallStatus` | `useWebRTCCall` (connection-state + error handlers) | updates `activeCall.status` (`callStore.ts:77-80`) |
| `clearCall` | `useWebRTCCall.endCall`/teardown, ring-timeout, `CallView` minimise (`:162`) | nulls `activeCall` → unmounts `CallView` |
| `clearInvite` | `useIncomingCall` on cancel/timeout (`:67`, `:74`) | nulls `incomingInvite` |

`connected` is set by `pc.onconnectionstatechange` (`useWebRTCCall.ts:190-193`); `failed` is set on getUserMedia denial, offer/answer errors, invite POST failure, or PC `failed`/`disconnected` (`useWebRTCCall.ts:145`, `198`, `232`, `324`). On `failed`, `CallView` auto-dismisses after 2.5s (`CallView.tsx:87-91`).

## UI

`CallProvider` (`src/components/call/CallProvider.tsx`) is the single overlay host, mounted once in `src/app/(main)/layout.tsx:37` inside the persistent app shell — so calls survive route changes within `(main)`. It reads `callStore` and renders `IncomingCallOverlay` when there's a pending invite and no active call, and `CallView` when `activeCall` is set (`CallProvider.tsx:21-26`).

- **`CallView`** (`src/components/call/CallView.tsx`) — full-screen `z-[100]` overlay. Mounts `useWebRTCCall` (`:52-63`), shows full-bleed remote video, a calling/connecting avatar placeholder, a remote camera-off placeholder, the call timer, and a chevron-down "minimise" button that calls `clearCall` **without ending the call** (`:159-168` — note: minimising unmounts `CallView` and thus tears down the PC via the cleanup effect; the comment says it goes back to chat).
- **`CallControls`** (`src/components/call/CallControls.tsx`) — mute mic, toggle camera, red End button (center), and flip-camera (only visible when `hasMultipleCameras`).
- **`DraggableSelfView`** (`src/components/call/DraggableSelfView.tsx`) — framer-motion draggable PiP self-view, `dragConstraints` bound to the `CallView` container; the `<video>` is `muted` to prevent echo (`:59-67`) and hidden when the camera is off.
- **`IncomingCallOverlay`** (`src/components/call/IncomingCallOverlay.tsx`) — `z-[110]` ring screen with accept/decline. On native it pulses haptics every 1.5s while ringing (`:21-37`). Accept → `acceptCall`; decline → POST `{action:"reject"}` then `declineCall`.

The incoming-call listener `useIncomingCall(profileId)` is mounted in `DeferredEffects` inside `PreloadProvider` (`src/components/PreloadProvider.tsx:25`, `:75`), so it's active whenever the signed-in user is past preload. If an invite arrives while already in a call, it auto-rejects (busy) via the route (`useIncomingCall.ts:41-52`).

## Key files

| File | Role |
|---|---|
| `src/lib/webrtc/signaling.ts` | Channel names, event types (`SignalingEvent`, `RingPayload`), event constants |
| `src/lib/webrtc/iceServers.ts` | `getIceServers()` — STUN default + optional TURN from env |
| `src/stores/callStore.ts` | Zustand call state machine (`activeCall`, `incomingInvite`) |
| `src/hooks/useWebRTCCall.ts` | RTCPeerConnection lifecycle, signaling subscribe, offer/answer/ICE, controls, teardown |
| `src/hooks/useIncomingCall.ts` | Global ring listener on `calls:user:<userId>`; surfaces invites, auto-reject when busy |
| `src/components/call/CallProvider.tsx` | Overlay host; mounted in `(main)/layout.tsx` |
| `src/components/call/CallView.tsx` | Full-screen call UI; mounts `useWebRTCCall` |
| `src/components/call/CallControls.tsx` | Mute / camera / end / flip controls |
| `src/components/call/DraggableSelfView.tsx` | Draggable muted PiP self-view |
| `src/components/call/IncomingCallOverlay.tsx` | Ring screen (accept/decline, native haptics) |
| `src/app/api/dm/[threadId]/call/route.ts` | Relays invite/cancel/reject via service-role broadcast; fires incoming-call push |
| `src/components/sheet/ChatSheetContent.tsx` | Call-initiation entry point (`handleStartCall`, `:210-219`) |

## Gotchas / invariants

- **No calls table / no persistence.** `callId` is a client UUID; there is no DB record, no call history, no server-side state. A call exists only as long as both clients hold it in memory. This is by design — see [DATA](./DATA.md) (the DM thread is the only persisted entity).
- **TURN credentials are public.** ICE config uses `NEXT_PUBLIC_*` env vars (`iceServers.ts:20-22`), so TURN username/credential are bundled into client JS. Use short-lived/ephemeral TURN credentials in production; static long-lived creds are exposed. With no TURN set, calls across strict/symmetric NAT (e.g. cellular) will fail to connect.
- **`broadcast: { self: false }`** on the call channel (`useWebRTCCall.ts:206`) — peers never hear their own messages, which is why `accept`/`offer`/`answer` routing relies on the `direction` guard (`:224`, `:240`, `:260`) rather than echo suppression.
- **Send-before-subscribe queue.** `sendSignal` buffers events in `pendingSignals` until the channel reaches `SUBSCRIBED`, then flushes (`useWebRTCCall.ts:83-91`, `304-309`). Likewise ICE candidates are queued until `setRemoteDescription` (`hasRemoteDescRef`) before being applied (`:273-285`, `:93-102`).
- **Caller waits for `accept` before `createOffer`.** No offer SDP is generated until the callee is on the channel, avoiding a wasted/early offer.
- **Strict-mode double-mount guard.** `isSetupRef` prevents the setup effect from running twice under React dev StrictMode (`useWebRTCCall.ts:127-128`, reset in cleanup `:374`).
- **30s ring timeout on both ends.** Caller cancels via `{action:"cancel"}` if unanswered (`useWebRTCCall.ts:336-345`); callee auto-dismisses the overlay after 30s (`useIncomingCall.ts:64-69`). These are independent timers, not coordinated.
- **No explicit glare handling.** Only one direction ever creates an offer (the caller, after `accept`), so SDP glare can't occur in normal flow. Simultaneous mutual calls are partly mitigated by the busy auto-reject (`useIncomingCall.ts:41-52`) and "only one ring at a time" (`:54-55`), but two users calling each other at the exact same instant is not formally resolved — `> TODO: verify` simultaneous-dial behavior.
- **Minimise tears down the call.** The chevron-down in `CallView` calls `clearCall` (`CallView.tsx:162`), which unmounts `CallView`; the `useWebRTCCall` cleanup then stops tracks and closes the PC. The label says "minimise" but there is no background-call mechanism — leaving the view ends media.
- **getUserMedia & permissions.** Calls always request `video: true, audio: true` (`useWebRTCCall.ts:136-139`); denial → `permissionError` + status `failed`. This runs inside the WKWebView on native — camera/mic permission prompts are governed by iOS `NSCameraUsageDescription`/`NSMicrophoneUsageDescription` in `Info.plist`. `> TODO: verify` getUserMedia works in the single persistent WKWebView (Capacitor `WKWebView` must have media capture permitted; no Capacitor camera plugin is used here).
- **`beforeunload` teardown** sends a final `end` and stops tracks on tab close (`useWebRTCCall.ts:356-368`); on native (no real unload) this won't fire, so abrupt app kill relies on the peer's PC `disconnected`/`failed` transition to clean up.
- **Flip camera uses `replaceTrack`** (no renegotiation) and rebuilds the `MediaStream` object so the self-view `srcObject` effect re-fires (`useWebRTCCall.ts:403-440`).

## Related

- [PUSH](./PUSH.md) — the incoming-call push (`data.kind === "call"`, `route.ts:98`) and how native surfaces it.
- [REALTIME](./REALTIME.md) — Supabase Realtime broadcast channels (signaling rides this transport).
- [API](./API.md) — the DM thread model and `verifyThreadParticipant`/`isBlocked` gates used by the call route.
- [DATA](./DATA.md) — DM threads/participants schema; note calls themselves are not persisted.
- [BRIDGE](./BRIDGE.md) / [ARCHITECTURE](./ARCHITECTURE.md) — the single persistent WKWebView shell the call UI runs inside.
