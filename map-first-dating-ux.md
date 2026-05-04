# Map-First Dating UX Direction

## Core Concept: Live Nearby Dating

The map is not just a background. It becomes the dating mechanic. Users are not browsing an endless deck; they are discovering people around them in space.

## 1. Radar Mode

Show nearby dating candidates as soft map pulses.

- Each candidate is a pin or pulse on the map.
- Bigger or brighter pulse means stronger compatibility or closer distance.
- Tapping a pulse opens a compact dating card.
- The card shows photo, age, distance, shared interests, and intent.
- Actions: Pass, Poke, Super Poke.

This feels more ownable than Tinder because discovery starts from geography.

## 2. Peek Card

Replace the current Nearby bottom card with a Peek Card.

When a user taps a map pin:

- A bottom sheet slides up.
- It shows one strong photo, name, age, distance, and verified badge.
- It shows 2-3 match reasons, such as "200m away", "Also likes hiking", or "Looking for long term".
- The user can drag the card slightly left or right, or tap actions.

Important: do not make it a full clone card stack. Make it a location-aware profile preview.

## 3. Orbit Discovery

Add a button like Explore Nearby.

When tapped:

- The map slowly moves candidate-to-candidate.
- Each stop opens the Peek Card.
- The user can Poke, Pass, or Next.
- The map camera physically travels to the next nearby person.

This makes the map feel alive and makes candidate browsing spatial.

## 4. Heat Zones

Show dating activity zones, not only individual people.

- Soft areas on the map show where active users are clustered.
- The user taps a zone to enter a mini queue of candidates in that area.
- Example: "6 people active near Borisova Garden."
- Then show Peek Cards for that zone.

This gives the app a local/social feel Tinder does not have.

## 5. Intent Filters On Map

Use quick chips over the map:

- All
- Online
- Verified
- Long-term
- Casual
- Friends
- Nearby now

These should filter map pins and candidates instantly. This makes preferences feel interactive instead of buried in settings.

## 6. Poke Radius

Make poking feel tied to distance.

Examples:

- Nearby users can be poked normally.
- Farther users require Super Poke.
- Very close users show a special Nearby now state.

This makes coins and proximity feel meaningful instead of arbitrary.

## 7. Match Moment On Map

When a mutual match happens:

- Do not only show a generic full-screen overlay.
- Zoom the map between both users' areas or pins.
- Show "You both poked each other."
- Then offer Chat or Keep exploring.

That makes matching feel native to the product.

## Recommended Flow

1. User opens map.
2. Dating candidates appear as distinct pins or pulses.
3. User taps a candidate.
4. Bottom Peek Card opens.
5. User can Pass, Poke, Super Poke, or view full profile.
6. After action, the app automatically suggests the next nearby candidate and pans the map.
7. Mutual match triggers a map-native match overlay.

## Existing Logic To Reuse

- `/api/dating/candidates`
- `/api/dating/poke`
- `/api/dating/pass`
- `/api/dating/matches`
- `MatchOverlay`, modified to be map-native
- Candidate quotas
- Super Poke coin logic
- Dating preferences

## Later Removal Candidate

Once this map-first flow works, `/discover` becomes unnecessary. The map becomes the discovery tab.

## Product Direction

The recommended direction is Map-first Peek Cards plus Orbit Discovery. This keeps the existing dating mechanics but makes the product feel differentiated, local, and harder to compare directly to Tinder.
