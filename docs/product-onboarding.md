# Product onboarding

## Product decision

Onboarding introduces a person and a current opportunity before asking for location.
It uses normal page flow on web and scrollable native content so larger text and mobile keyboards remain usable.

## Flow

1. Create or restore an account, preserving any Plan or connection invitation.
2. Choose a display name and username, with an optional photo on web.
3. Select three to five interests.
4. Choose a current activity and when availability ends, or explicitly decide later.
5. Read the location explanation and choose Enable location or Not now.
6. Complete onboarding only after the server acknowledges it, then return to the invitation or Now.

Availability is saved before advancing; failed saves stay on the current step and remain recoverable.
Location is requested only by an explicit action, and denied permission does not prevent access to Plans, invitations, or chat.
Changing discovery visibility is available in Me → Settings on both clients.
The web photo upload uses the existing moderation pipeline and communicates its pending review state.
Native photos remain available through profile editing after introduction.

The adult-only guidance describes community eligibility; it does not claim age verification.
The matching experience presents current intent, approximate distance, shared interests, and remaining availability.

## Research basis

Apple recommends requesting permission in context and explaining its value in the [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/privacy#Requesting-permission).
Nielsen Norman Group explains the value of showing benefit before requesting access in [The reciprocity principle](https://www.nngroup.com/articles/reciprocity-principle/).
Errors use explicit text and recovery actions consistent with the [W3C form error guidance](https://design-system.w3.org/styles/form-errors.html).

## Verification

The isolated browser journey uses the real sign-in and onboarding UI, saves three interests and an activity, declines location, and verifies that Now retains the saved activity.
Native type and behavior checks cover shared contract use and recoverable onboarding completion.
Physical-device permission, keyboard, photo-picker, and relaunch behavior remain release checks.
