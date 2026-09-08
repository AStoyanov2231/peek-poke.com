Save this as text file inside the root folder call it “Product-redesign.md”

You are working on the existing peek-poke.com project.

Your job is not to make small UI tweaks. Treat this as a product redesign with permission to change flows, navigation, hierarchy, feature behavior, terminology, and visual design where necessary.

The goal is to turn Peek & Poke into a product people actually want to open because it helps them turn nearby people into real-world plans.

Product direction

The product should no longer feel like:

“People around me on a map.”

The product should become:

“Find out who’s free. Poke them. Go do something.”

The core loop is:

Now → Poke → Chat → Plan → Meet

Everything in the app should reinforce that loop.

⸻

1. Core product concept

Peek & Poke should be the fastest way to turn nearby people into something happening in real life.

Do not build another social feed.

Do not optimize for endless messaging.

Do not try to compete with Instagram, Facebook, Tinder, or WhatsApp at what they already do.

Peek & Poke should own:

“Who around me could actually do something right now?”

Users should primarily discover people based on:

* current availability
* current intent
* proximity
* shared interests
* mutual friends
* previous interactions
* recency/activity

Distance alone is not enough.

Instead of presenting users like:

Daniel
700m
Online
Add Friend

Prefer:

☕ Up for coffee
Daniel · 700m
Free for the next 90 min
Startups · Gym · Tech
2 mutual friends
[Poke: Coffee?]

The person’s intent should be visually more important than generic profile information.

⸻

2. Replace “Add Friend” as the primary social action

Friendship should not be the first commitment between strangers.

The primary interaction should be:

Poke

A Poke is a lightweight contextual invitation.

Examples:

* Coffee?
* Walk?
* Gym?
* Food?
* Study?
* Drinks?
* Gaming?
* Explore?
* Custom activity

Pokes should expire.

Example:

Alex poked you
☕ Coffee?
600m away
Expires in 43 min

Possible replies:

* I’m in
* Later
* Not today

Once accepted:

* open a temporary conversation
* suggest a place/time
* help form a Plan
* after the meetup, users can become friends

Friendship becomes the result of interaction instead of a prerequisite for it.

⸻

3. Add temporary availability / intent

Users need a lightweight way to say what they want to do.

Examples:

* Coffee
* Food
* Walk
* Gym
* Study
* Drinks
* Gaming
* Explore
* Anything
* Custom

Intent must have a time window.

Examples:

* Next 30 minutes
* Next hour
* Next 2 hours
* This afternoon
* Tonight
* Custom

Intent should automatically expire.

The system should never leave stale “available” states.

This becomes one of the most important signals in discovery ranking.

⸻

4. Add a new “Now” screen

The map should remain because it is distinctive, but it should no longer carry the entire product experience.

Primary mobile navigation should become approximately:

Now — Map — Inbox — Me

The exact navigation implementation may be adjusted if a better structure emerges during implementation.

Now screen

The first thing users should see is:

What are you up for?

Activity chips:

* Coffee
* Food
* Walk
* Gym
* Study
* Drinks
* Gaming
* Explore
* Custom

Below that, surface sections such as:

People active now

People whose current availability matches the user.

Friends nearby

Existing friends who are close and available.

Plans near you

Existing open Plans users may join.

Your Circles

Relevant friend/community groups with activity happening now.

The Now screen should feel alive even before opening the map.

⸻

5. Improve the Map

Keep the map, but redesign its information architecture.

The map should communicate activity and intent, not just where users are.

Examples:

* subtle avatar pin = nearby
* glowing/pulsing avatar = available now
* activity icon = coffee, gym, food, etc.
* clustered avatars = active group Plan
* selected user = richer activity card

The map should feel alive and social without becoming visually noisy.

Do not reveal exact stranger locations.

Use approximate positions where appropriate.

⸻

6. AI-assisted chat

Existing chat should become much smarter.

Use available contextual data to generate suggested responses dynamically.

Possible context:

* both users’ interests
* current Poke
* distance
* availability
* shared interests
* mutual friends
* nearby venues
* nearby activities
* time of day
* weather if available in the future
* conversation context
* previous Plans
* previous places visited

AI should NOT exist to make conversations longer.

Its purpose is to reduce friction between:

Poke → real-world meeting

For example:

Alex sends:

Coffee?

Instead of generic suggestions like:

Sounds good!

Generate suggestions such as:

I’m free in 20 min.

Yeah — want somewhere between us?

Want to try Drekka?

When relevant, show a nearby place suggestion directly inside the conversation:

Drekka
450m from you
380m from Alex

Actions:

* Suggest place
* Meet here
* Another option

AI-generated suggestions should be editable and never automatically sent.

Design the system so AI assistance feels like a native product capability, not a chatbot bolted onto messaging.

⸻

7. Plans

After a Poke is accepted, users should easily convert the conversation into a Plan.

Plans should be intentionally lightweight.

Do not build complex calendar software.

Example:

☕ Coffee
Today · 17:00
Around Studentski Grad
Alex + Daniel

Possible actions:

* Change time
* Change place
* Invite someone
* Share
* Cancel

Creating a Plan should take seconds.

Plans can be:

* private
* friend-only
* Circle-only
* open nearby

Open Plans can also become a discovery mechanic.

⸻

8. QR / Scan

DO NOT remove the QR scanner.

Remove it as an unexplained standalone feature.

Rename it:

Scan

Scan should connect the digital product to real-world interactions.

Use Scan for:

Connect after meeting

One user shows their Peek QR.

Another scans.

Create the connection quickly without username searching.

Join a Plan

Every Plan can expose a QR code.

Example:

Drinks tonight
20:30
Sofia Center
3 going

Scan → preview → Join.

Join a Circle

Examples:

* university group
* gym crew
* developer community
* conference attendees
* coworking group

Venue/event check-in

Longer-term feature.

Users could scan a Peek QR at a partner venue or event.

Potential uses:

* confirm arrival
* meeting rewards
* venue rewards
* sponsored experiences

Scan should normally appear contextually:

* Add someone you met → Scan
* Join a Plan → Scan
* Join a Circle → Scan
* Check in → Scan

It may also exist as a secondary action in the Now header, profile, or action menu.

Do not waste a major navigation item on it.

⸻

9. Circles

Rework generic Groups into:

Circles

Circles should feel lightweight and real-world oriented.

Examples:

* Gym crew
* Sofia developers
* University friends
* Close friends
* Coworking people
* Erasmus group

Primary Circle use case:

Anyone want lunch?

or:

Gym at 19:00?

Circles should help create Plans quickly.

Avoid making them into Facebook Groups with feeds and complex moderation systems unless required later.

⸻

10. Coins

The current coin mechanic needs major correction.

Core social behavior must NOT cost coins.

Do not charge users coins for:

* sending normal friend requests
* accepting Pokes
* messaging
* basic profiles/photos
* joining normal Plans
* forming friendships

The current behavior where coins gate friend requests creates unnecessary friction in the network.

Coins should reward behaviors Peek & Poke wants more of.

Examples:

* meeting someone
* meeting someone new through a Poke
* creating a successful group Plan
* participating in a community activity

Example rewards only, adjust if necessary:

* friend meetup: +1
* successful new-person meetup: +2
* group meetup: +3
* community Plan participation: +2

Coins can be spent on OPTIONAL enhancements:

* discovery boost
* Super Poke
* cosmetic effects
* Poke animations
* Plan highlighting
* temporary status boost
* profile customization

Never make coins necessary to use the core network.

Protect this system against obvious GPS/reward farming.

Avoid public leaderboards based purely on number of meetings.

⸻

11. Meeting detection

There is already proximity-based meeting detection in the project.

This should become a visible product feature.

Instead of silently updating coins, celebrate the real-world interaction.

Example:

You and Alex met 🎉

+1 Poke Coin

3 hangs together

Actions:

* Add a photo
* Plan another
* Add as friend
* Done

This is potentially one of Peek & Poke’s strongest differentiators.

The product should feel aware that something real happened.

Keep the interaction tasteful.

Avoid childish gamification.

⸻

12. Onboarding redesign

Current onboarding is too much like profile configuration.

The objective of onboarding should be:

get the user to their first meaningful opportunity as fast as possible

Target flow:

1. Apple / Google / account creation
2. Name + profile photo
3. Select at least a few interests
4. Choose what they would currently be up for
5. Explain why location is needed
6. Ask for location permission
7. Immediately show relevant nearby people / Plans
8. Encourage the first Poke

Do not force unnecessary setup before value is visible.

The location explanation should happen BEFORE the OS permission dialog.

Example:

See who’s open to hanging out nearby.

Your exact location is never shown to strangers.

Then:

Enable location

The onboarding success event should not simply be “profile complete.”

It should be closer to:

* availability created
* first relevant person shown
* first Poke sent

⸻

13. Empty states

“No one nearby” must NEVER be a dead end.

This is extremely important for an early network-effect product.

If there are no nearby users, provide useful next actions.

Example:

Nobody active within 2 km right now.

Then offer:

* Expand to 10 km
* See people active later today
* Start an open Plan
* Invite a friend
* Join a nearby Circle

The app must always give the user something productive to do.

⸻

14. Growth and sharing

Plans should be shareable outside the app.

This should become an acquisition mechanism.

Example shared link:

🍸 Drinks tonight
20:30
Sofia Center
3 going

When someone opens the link without an account:

DO NOT immediately dump them on the login screen.

Show a polished mobile web preview first.

Then:

Join Plan

Only after expressing intent should login/signup be required.

The public website should also stop being effectively just a login gateway.

Create a real public-facing introduction to the product.

Possible messaging:

Find out who’s free.

Poke them.

Go do something.

or:

Stop texting 12 people to find out who’s free.

or:

See who’s up for something nearby.

⸻

15. Premium redesign

Do not monetize basic network utility too early.

Remove or strongly reconsider monetizing:

* friend count
* basic photos
* essential discovery

These hurt network liquidity.

Premium should monetize power features.

Possible direction:

Peek+

Features may include:

* advanced discovery filters
* travel mode
* extra boosts
* enhanced Circle features
* profile customization
* expanded activity/history insights
* additional Super Pokes

Approximate pricing hypotheses:

* €5.99/month
* €39.99–49.99/year
* optional boosts around €1.99–2.99

Treat pricing as experimentation, not fixed truth.

Long-term monetization should also come from the real-world coordination layer.

Examples:

After two users agree to coffee:

Suggested nearby café

Eventually support:

* sponsored venues
* activity bookings
* affiliate revenue
* event partners
* cafés
* bowling
* padel
* escape rooms
* cinema
* local events

Long-term strategic principle:

It is better to monetize:

“Where should these people go?”

than:

“Pay us so you can have more friends.”

⸻

16. Safety and privacy

This needs to be first-class.

Especially because Peek shows nearby people.

Implement or reinforce:

* approximate location for strangers
* exact location only when explicitly shared / mutually appropriate
* expiring location sharing
* visibility controls
* Friends
* Friends of friends
* Circles
* Everyone
* block everywhere
* report everywhere
* rate-limit unsolicited Pokes
* recommend public meetup locations
* ability to share Plan with a trusted person

Strongly consider positioning the initial product as 18+.

The product should communicate:

Nearby without broadcasting exactly where you are.

⸻

17. UI REDESIGN — HIGH PRIORITY

The current UI is too generic.

Do not simply rearrange existing cards.

Create a stronger visual identity for Peek & Poke.

The app should feel:

* social
* spontaneous
* modern
* slightly playful
* premium
* alive
* location-aware
* real-time

It should NOT look like:

* a generic SaaS dashboard
* a generic shadcn app
* a generic Tailwind template
* a dating-app clone
* a cryptocurrency app
* a corporate social network

Inspect the existing design tokens and components, but feel free to evolve them.

Visual hierarchy

The hierarchy should emphasize:

1. what is happening
2. who is involved
3. how close / when
4. what action the user can take

Not:

1. avatar
2. username
3. generic metadata
4. generic button

For example:

Large:

☕ Coffee?

Then:

Alex

Then:

600m · free until 18:30

Then:

Startups · Tech · Gym

Then:

[Poke]

⸻

18. Build a recognizable visual language

Create specific visual motifs for Peek & Poke.

Possible concepts:

Poke ripple

Sending a Poke generates a subtle expanding ripple around the avatar/button.

Active aura

Users available right now have a subtle animated halo/aura.

Connection animation

When a Poke is accepted, two small visual pulses meet.

Plan state

Accepted activities should visually transform from a social invitation into a structured Plan card.

Meeting moment

Meeting confirmation can use a restrained celebratory interaction.

Do not over-animate the interface.

Motion should communicate state.

⸻

19. Typography and spacing

Improve typography aggressively.

The current product should feel more editorial and intentional.

Use:

* clear hierarchy
* confident larger headings
* tighter metadata typography
* strong activity labels
* fewer arbitrary card borders
* more purposeful whitespace

Avoid excessive text boxes and nested cards.

Not every section needs a rectangle around it.

Prefer depth through:

* spacing
* typography
* background layers
* blur where appropriate
* subtle elevation
* motion
* contrast

Do not create a “card inside a card inside a card” design.

⸻

20. Color

Keep any useful existing brand color if it works, but establish a stronger system.

Create semantic states for:

* active now
* Poke
* accepted
* Plan
* friend
* unavailable
* nearby
* premium

Avoid rainbow UI.

A small intentional palette is better.

The interface should remain usable in both light and dark themes if the project supports them.

⸻

21. Profile cards

Nearby-person cards need a major redesign.

They should communicate a reason to act.

Example structure:

☕ Coffee for the next hour

[Avatar] Alex

650 m away

You both like Startups, AI and Gym

2 mutual friends

[Coffee?] [View]

Avoid giant profile cards with mostly empty decoration.

Make them compact enough to browse but rich enough to create intent.

⸻

22. Inbox redesign

Inbox should not only look like a traditional messaging list.

Organize around things that need attention.

Possible sections:

Pokes

Incoming invitations.

Plans

Accepted activity coordination.

Messages

Active conversations.

Requests / notifications

Secondary.

Time-sensitive items should appear before passive chats.

Example:

☕ Alex wants coffee
8 min ago · expires in 37 min

This is more important than:

Daniel
“haha yeah”

Design accordingly.

⸻

23. AI suggestions UI

AI suggestions should feel native and lightweight.

Do NOT create a big “Ask AI” experience.

Possible interaction:

Conversation message:

Coffee?

Below composer:

I’m free in 20m

Somewhere between us?

Suggest a café

Tapping suggestion places it into the composer or executes a safe preview flow.

For venue suggestions:

Show a compact venue card.

Always allow manual editing.

Avoid AI badges everywhere.

The intelligence should feel implicit.

⸻

24. Profile

Profile should focus on useful social context.

Possible hierarchy:

* photo
* name / username
* current availability
* interests
* Circles
* friends
* recent Plans / hangs where appropriate
* privacy
* settings

Avoid turning profiles into Instagram pages.

Users are here to decide:

Would I do something with this person?

not:

Can I consume this person’s content?

⸻

25. Public landing page

The unauthenticated website needs a proper product experience.

Build a strong landing page.

Do not start with a login form.

Communicate the loop visually:

Peek

See who’s free nearby.

Poke

Ask them to do something.

Meet

Go actually do it.

Show the UI itself as product storytelling.

Primary CTA:

See who’s around

Secondary:

How it works

Sign in should be secondary.

⸻

26. Initial market assumptions

Do not design the product as if it already has millions of users everywhere.

Density matters.

The product should work especially well for concentrated communities such as:

* university students
* young professionals
* coworking communities
* conferences
* developer communities
* Erasmus groups
* gyms
* festivals

Sofia can be treated as a realistic initial market context.

Features should help create local density instead of hiding the fact that the network is early.

⸻

27. Metrics / analytics

Instrument the redesigned flow.

The north-star metric should be:

Successful real-world connections per weekly active user

Track at minimum:

Activation

User creates current availability or sends first Poke.

Discovery

User receives multiple relevant nearby opportunities.

Intent

Pokes sent per active user.

Reciprocity

Poke acceptance rate.

Planning

Accepted Pokes converted into Plans.

Conversion

Plans resulting in confirmed/detected meetup.

Retention

Users who create another Plan / meetup later.

Density

Relevant active opportunities available within a useful radius.

Do not optimize primarily for:

* message count
* time spent
* profile views
* map opens

Those can be supporting metrics, not the product goal.

⸻

28. Implementation approach

Start by inspecting the existing implementation thoroughly.

Understand:

* current routes
* database schema
* auth
* map
* friend system
* coins
* meeting detection
* messages
* groups
* onboarding
* profile
* Premium
* shared contracts
* web/native differences

Preserve good infrastructure.

Do not rewrite stable systems unnecessarily.

But do not preserve weak product decisions just because they already exist.

Make architectural changes where the new product model requires them.

⸻

29. Work in coherent vertical slices

Do not make hundreds of disconnected UI edits.

Build the new experience through complete vertical flows.

Recommended implementation order:

Phase 1 — Foundation + visual system

* audit existing design system
* improve typography
* spacing
* surfaces
* buttons
* icons
* motion
* cards
* mobile navigation
* establish Peek-specific visual language
* create reusable activity / Poke / Plan components

Phase 2 — Now

Build the new Now screen.

Include:

* intent selection
* active nearby people
* friends nearby
* Plans
* empty states

Phase 3 — Poke

Replace Add Friend as the primary discovery action.

Implement:

* activity-based Poke
* expiration
* incoming Pokes
* accept / later / decline
* temporary connection state

Phase 4 — Chat intelligence

Add:

* context-aware suggested replies
* nearby place suggestions
* Plan creation from conversation

Keep AI behind a clean abstraction.

Do not tightly couple UI directly to one model provider.

Phase 5 — Plans

Implement lightweight Plans.

Connect:

Poke → Chat → Plan.

Phase 6 — Meet

Promote meeting detection into the user-facing flow.

Add meeting confirmation/reward UX.

Phase 7 — Scan

Reposition QR scanner as contextual Scan.

Support:

* profile connection
* Plan joining
* Circle joining

Phase 8 — Onboarding

Redesign onboarding around first value.

Phase 9 — Coins / Premium

Remove coin friction from the core graph.

Rebuild Premium around optional power features.

Phase 10 — Public acquisition

Build:

* landing page
* public Plan previews
* invite links
* deep links

⸻

30. Quality requirements

Do not accept “functional but generic.”

Every screen should be reviewed for:

* hierarchy
* visual character
* spacing
* typography
* empty states
* loading states
* animation
* interaction feedback
* mobile ergonomics
* accessibility
* consistency

Avoid placeholder-quality UI.

Do not simply use default component-library appearances.

Customize components until they feel native to Peek & Poke.

Prefer fewer strong components over many inconsistent ones.

⸻

31. Responsive behavior

The project contains both web and native clients.

Maintain conceptual consistency across both.

Do not force desktop patterns onto mobile.

Mobile is the primary social experience.

Desktop can expose more map/sidebar density.

If implementing one platform first, preserve shared contracts and avoid decisions that make the second platform unnecessarily difficult.

⸻

32. Existing features

Do not delete existing functionality blindly.

For each existing feature, decide whether it should be:

* retained
* redesigned
* merged
* demoted
* renamed
* removed

Examples:

Friend requests:
demote behind Poke / post-interaction friendship.

Groups:
evolve into Circles.

QR Scanner:
evolve into contextual Scan.

Meeting detection:
promote heavily.

Coins:
redesign.

Premium:
redesign.

Map:
retain but change its role.

Inbox:
retain but restructure around time-sensitive intent.

Chat:
retain and augment with contextual intelligence.

⸻

33. Decision-making authority

You have permission to improve the product beyond the literal requirements here.

If you find a better UX while implementing, use it.

However, every major decision should support the same core product thesis:

turn nearby intent into real-world interaction with minimum friction.

Do not add features merely because they are technically interesting.

When deciding between two approaches, prefer the one that gets users from discovery to real-world activity faster.

⸻

34. Desired result

After this redesign, the app should feel like a distinct consumer product.

A user opening Peek & Poke should quickly understand:

1. what people around them are up for
2. who they could do it with
3. how to start the interaction
4. where/when to meet
5. that Peek recognizes when the interaction actually happened

The experience should feel much more polished, visual, intentional and branded than the current interface.

The final product should make this sentence true:

Find out who’s free. Poke them. Go do something.