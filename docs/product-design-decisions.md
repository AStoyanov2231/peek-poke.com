# Product design decisions

## Make the next useful action obvious

Now starts with what someone wants to do and for how long.
Available people emphasize the shared activity, remaining availability, and approximate distance before profile details.
Poke is the primary invitation; accepted Pokes open chat, and chat can create a Plan without inventing a time or venue.
The main mobile destinations are Now, Map, Inbox, and Me.
Scan belongs beside the situation where someone needs it.

## Design for an empty neighborhood

Discovery does not invent people or activity.
A quiet result explains what happened and offers a wider radius, Plan creation, an invitation link, or Scan.
Loading, empty, and failed requests have distinct states.
This follows the principle that an empty interface should explain its state and provide a useful next step. [Nielsen Norman Group](https://www.nngroup.com/articles/empty-state-interface-design/)

## Let people see the invitation before committing

A public Plan preview exposes only the intentional invitation details: activity, time, public place description, and capacity.
Sign-in and onboarding preserve the preview path.
Joining still requires a separate action, and the host can revoke the link.
A backend outage offers retry instead of telling someone that a valid invitation expired.

## Respect permission and attention

Location is requested after an explanation and an explicit action.
Nearby matching uses approximate display areas, and the product remains navigable after permission denial.
Permissions should arrive in the context where people understand their purpose. [Apple privacy guidance](https://developer.apple.com/design/human-interface-guidelines/privacy#Requesting-permission)

Pokes expire and have low-pressure responses: accept, later, or not today.
Chat suggestions only fill an editable composer.
The app never automatically accepts a Plan, sends a suggested message, or records a mutual meetup on someone's behalf.

## Preserve accessible controls

The redesign restores browser zoom and selection, supplies a skip link, visible keyboard focus, explicit labels, and reduced-motion behavior.
Mobile activity controls use at least 44-pixel targets, and narrow layouts avoid squeezing explanatory copy beside actions.
Text should remain useful when enlarged and content should reflow instead of requiring horizontal scrolling. [WCAG resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

## Give the product a warm identity

Cream surfaces, coral actions, sage availability indicators, compact typography, and an open-circle brand mark carry the identity across the landing page, Now, Inbox, Plans, and shared native tokens.
The landing illustration is explicitly an example of a Plan, not a claim about actual local users.
Decorative motion respects reduced-motion settings and does not obstruct the primary actions.

## Keep claims tied to implemented behavior

Friendship, messaging, Pokes, Plans, and ordinary public photos are free.
Private photos stay private regardless of subscription.
Mutual meetup acknowledgement records both participants' confirmations without promising a reward or proof of location.
After a Plan starts, current members retain it in their Plans list for 48 hours so they can confirm attendance with each other.
This member-only recent group is capped at 20 Plans, while future Plans receive up to 80 slots.
Plan hosts cannot edit a Plan after it starts, preserving the scheduled record used for confirmation and analytics.
Unconfigured paid features and location-verification rewards are disabled until their release prerequisites are satisfied.
