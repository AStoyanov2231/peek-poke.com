# Adult admission

Peek & Poke is restricted to adults aged 18 and over, as confirmed by the owner on 2026-09-08.
The admission decision applies to existing and new accounts before onboarding or social access.
This document describes the implementation contract; deployment and verification status remain in `Progress.md`.

## Decision and privacy

The client submits a calendar birth date to `POST /api/age-admission` over the authenticated connection.
The server validates the actual calendar date, rejects dates before 1900 or in the future, and calculates the eighteenth anniversary using the current UTC date.
A February 29 birth reaches that anniversary on March 1 in a non-leap year under this product rule.
Invalid input does not create a decision.

Only the eligibility result, decision time, and policy version are stored in the private `account_age_admissions` table.
The birth date must not enter persistent storage, analytics, logs, or the client query/mutation cache.
The first valid declaration is immutable, so both clients show a date review before final submission.
Deleting an account removes its eligibility record, including when the profile becomes a soft tombstone.

`GET /api/age-admission` and `bootstrap.age_admission` return `{ status, decided_at }`.
No record means `pending` with a null timestamp.
An `adult` or `blocked` decision has a non-null timestamp.
The response does not reveal the birth date or an exact age.

## Access boundary

Pending and blocked accounts can access admission, authentication/recovery, bootstrap, account deletion, and public information pages.
Social APIs fail closed unless the current account has an adult decision.
Database RPCs, direct table permissions, and private Realtime authorization must enforce the same boundary independently of client routing.
Account deletion does not depend on the admission storage being available.
Public shared-Plan previews remain available before admission; joining or participating requires admission.

Web and native preserve a safe internal destination while admission is pending.
The native app must withhold social subscriptions and push/call registration until admission succeeds.
Pending or blocked profiles must not be offered as people to meet or receive new social interactions.

## Assurance limits and launch work

This is self-declared eligibility, not verified age or identity.
A person can provide a false birth date or recreate a deleted account.
The existing “May be underage” report reason is available to admitted members, but moderation is not a substitute for age assurance.
No verification provider or paid identity service is configured.
The operator still needs an age-assurance assessment appropriate to the app, a supported correction/appeal process, and a monitored support/privacy contact before public launch.
No address has been selected, so product screens must not invent one.

The [European Commission's guidance on protecting minors](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A52025XC05519) identifies limits of self-declaration as age assurance.
This implementation alone is not evidence that legal age-assurance obligations are satisfied.

## Design references

The [GOV.UK date input pattern](https://design-system.service.gov.uk/components/date-input/) supports separate labelled day, month, and year fields for memorable dates, with numeric input and date-of-birth autocomplete.
The [EDPB age-assurance statement](https://www.edpb.europa.eu/our-work-tools/our-documents/statements/statement-12025-age-assurance_en) and [EDPB announcement](https://www.edpb.europa.eu/news/edpb-adopts-statement-on-age-assurance-creates-a-task-force-on-ai-enforcement-and-gives_en) inform the decision to minimize retained information.
These references inform product design; they do not establish compliance for this deployment.
