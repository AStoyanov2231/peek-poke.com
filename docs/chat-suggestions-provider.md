# Optional chat suggestion provider

Peek & Poke uses deterministic, server-generated editable chat suggestions by default.
The optional OpenAI adapter is disabled unless every server-only setting below is configured.

```sh
CHAT_SUGGESTIONS_PROVIDER=openai
OPENAI_API_KEY=replace-with-a-server-only-key
OPENAI_CHAT_SUGGESTIONS_MODEL=replace-with-an-explicit-supported-model
```

Do not expose any of these settings through a `NEXT_PUBLIC_` variable.
When the provider selector, key, or model is absent, invalid, unavailable, times out, or returns malformed output, the application returns the deterministic suggestions instead.

The adapter calls the Responses API with `store: false`, a four-second timeout, a 256-token output limit, a 16 KiB declared and streamed response-body limit, and strict JSON Schema output.
It sends only a canonical Poke activity enum, up to three bounded shared-interest labels, coarse availability windows and counts, and a capped shared-plan count.
It does not send custom activity labels, account or profile names, identifiers, raw messages, exact coordinates, venue history, or provider request and response logs.
Interest labels are treated as untrusted data and are never instructions.
Suggestions populate an editable draft only and cannot send a message or create a plan.

Before enabling the adapter in any environment, the operator must complete an external-processor privacy review, confirm the selected model and data-retention terms, set the server-only variables in that environment, and test its configured failure fallback.
The shared `openai` source parser must be released to native clients before the provider is enabled for users of those clients.
This document does not represent user consent or a privacy-policy claim.

The implementation uses the [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) with structured JSON Schema output.
The response parser accepts recognized reasoning items alongside exactly one completed assistant text message, and rejects tool output, refusals, incomplete responses, and ambiguous messages.
