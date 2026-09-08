# Chat venue suggestions

Set `GOOGLE_PLACES_API_KEY` only in the server runtime to enable venue cards.
The endpoint uses Google Places [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search) with a POST request, an explicit field mask, a 1.5 km circle, a three-result cap, and distance ranking.
Google requires a field mask for Nearby Search, supports `includedTypes` to bound results, and supports up to 20 results, so the adapter asks only for the fields needed by the card and caps the request at three results.

The provider is never given a stored coordinate directly.
Each member's fresh location is first reduced to a 2-decimal public cell, then the server calculates and rounds the midpoint before requesting venues.
The route requires a current DM membership, no block in either direction, an active peer account, fresh locations from both members, and mutual existing discovery-audience visibility.
An accepted thread or Poke does not bypass a hidden discovery audience.

The request restricts results to public meeting categories, and the adapter verifies returned type metadata before emitting a card.
The relevant allowed categories are based on Google's [Place Types (New)](https://developers.google.com/maps/documentation/places/web-service/place-types) reference: cafes, restaurants, parks, libraries, museums, tourist attractions, and bars.
No conversation text, Poke note, profile data, or precise member location is sent to Google.

When the key is absent, consent or freshness is unavailable, or the provider fails, the endpoint returns `{ "source": "unavailable", "venues": [] }` and the UI shows no cards.
