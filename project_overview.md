# Project Overview

## Tech Stack

- **Framework**: Next.js 16.1.1 (App Router), React 19, TypeScript 5
- **Styling**: Tailwind CSS 3.4, Framer Motion, shadcn/ui (Radix primitives)
- **State**: Zustand 5.0.9, TanStack React Query 5.90
- **Database**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Payments**: Stripe (subscriptions, webhooks, billing portal)
- **Maps**: MapLibre GL 5.19, react-map-gl 8.1, Supercluster 8.0
- **Validation**: Zod 4.3
- **Icons**: Phosphor Icons, Lucide React
- **Native**: iOS/Android WebView bridge (`window.webkit.messageHandlers`)

---

## Architecture

### Request Flow

1. **Browser/Native** -> Next.js App Router
2. **Middleware** (`src/middleware.ts`) -> CSRF protection, auth validation, onboarding redirects
3. **API Routes** (`src/app/api/`) -> `withAuth()` wrapper, Zod validation, Supabase RPCs
4. **Supabase** -> PostgreSQL with RLS policies

### Auth Layer

- Supabase Auth (email/password + Google OAuth + Apple OAuth)
- Middleware validates session for all protected routes
- API routes use `withAuth()` HOF providing typed `{ user, supabase, params }` to handlers
- Dual auth mode: cookies (web) + Bearer token (native app)
- CSRF protection on mutations (POST/PATCH/PUT/DELETE), exempts Stripe webhooks

### Real-time Layer

- **Presence**: Supabase Realtime channels for online/offline status and nearby user tracking
- **Messaging**: PostgreSQL CDC subscriptions for DM messages, friendships, profile updates
- **Location**: 2km radius nearby user detection using Haversine formula
- **Meeting detection**: Automatic coin rewards when friends are within 50m

### State Management

- Single Zustand store (`appStore.ts`) preloaded on app init via `/api/preload`
- Memoized selector hooks (`selectors.ts`) for optimized component re-renders
- Real-time updates flow: Supabase subscription -> store mutation -> component re-render

### Payment Flow

1. User initiates checkout -> `/api/stripe/checkout` or `/api/stripe/payment-method-subscribe`
2. Stripe processes payment (supports 3D Secure)
3. Webhook (`/api/stripe/webhook`) grants `subscriber` role via `grant_role` RPC
4. Role changes never trusted from client redirects

---

## Environment Variables

```bash
GOOGLE_PLACES_API_KEY=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_URL=
STRIPE_PREMIUM_PRICE_ID=
STRIPE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VERCEL_OIDC_TOKEN=
```

---

## Directory Structure

```
src/
├── app/
│   ├── (auth)/                  # Auth pages + server actions
│   │   ├── actions.ts           # login, signup, signOut, OAuth
│   │   ├── login/page.tsx
│   │   └── welcome/page.tsx
│   ├── (main)/                  # Protected app pages
│   │   ├── layout.tsx           # Main layout with nav + providers
│   │   ├── page.tsx             # Map/home page
│   │   ├── admin/page.tsx
│   │   ├── chat/[threadId]/page.tsx
│   │   ├── friends/page.tsx
│   │   ├── inbox/page.tsx
│   │   ├── messages/page.tsx
│   │   ├── moderation/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── profile/page.tsx
│   │   └── profile/[userId]/page.tsx
│   ├── api/                     # API routes (see API section)
│   └── auth/callback/route.ts   # OAuth callback handler
├── components/
│   ├── ui/                      # shadcn/ui primitives (button, dialog, card, etc.)
│   ├── layout/                  # DesktopNav, MobileNav, NavButton, ContentWrapper, DisableZoom
│   ├── map/                     # MapView, UserPin, HighlightedPin, NearbySwiper, RecenterButton, MapTopLabels
│   ├── inbox/                   # InboxClient, ChatsTab, FriendsTab, RequestsTab, InboxChatPanel
│   ├── messages/                # MessageDeliveryStatus, TypingIndicator
│   ├── profile/                 # ProfilePageClient, ProfileHeader, PhotoGallery, SettingsSheet, etc.
│   ├── friends/                 # FriendsTabsClient, SwipeableFriendCard, FriendsSkeleton
│   ├── coins/                   # CoinBalance, InsufficientCoinsDialog
│   ├── sheet/                   # AdminSheetContent, ChatSheetContent, ModerationSheetContent
│   ├── admin/                   # AdminPageClient
│   ├── moderation/              # ModerationPageClient
│   ├── AuthBridgeProvider.tsx    # Native app auth bridge
│   ├── NativeBridgeProvider.tsx  # Native app communication
│   ├── PreloadProvider.tsx       # Initial data preload
│   ├── QueryProvider.tsx         # TanStack Query setup
│   └── SplashScreen.tsx          # Loading screen
├── hooks/
│   ├── useAuth.ts               # Auth state, session, profile init
│   ├── useGeolocation.ts        # GPS location with 5s debounce
│   ├── useIsDesktop.ts          # Viewport detection (768px breakpoint)
│   ├── useKeyboardVisible.ts    # Mobile keyboard detection
│   ├── useMeetingDetection.ts   # Friend proximity (50m) -> coin rewards
│   ├── useNearbyPresence.ts     # Realtime nearby users (2km radius, Haversine)
│   ├── usePresence.ts           # Online/offline status via Supabase presence
│   ├── useRealtimeSync.ts       # CDC subscriptions for DMs, friendships, profiles
│   └── useTransitionRouter.ts   # View Transitions API router wrapper
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Browser Supabase client (singleton)
│   │   └── server.ts            # Server Supabase client (cookie + Bearer dual-mode)
│   ├── auth.ts                  # withAuth(), requireModeratorRole(), verifyThreadParticipant(), isBlocked()
│   ├── constants.ts             # MAX_PHOTOS: 6, FREE_USER_FRIEND_LIMIT: 3, EDIT_WINDOW_MINUTES: 15, etc.
│   ├── email-validation.ts      # Email format, typo detection (gmial->gmail), disposable blocking
│   ├── image-compression.ts     # compressImage(), createThumbnail()
│   ├── native.ts                # isNativeApp(), postToNative()
│   ├── navigation.ts            # navItems config array
│   ├── preload.ts               # Bulk data fetching for app init
│   ├── stripe.ts                # Stripe client singleton
│   ├── stripe-webhook.ts        # handleCheckoutCompleted, handleSubscriptionUpdated/Deleted
│   ├── upload.ts                # validateImageFile(), uploadFile(), uploadThumbnail()
│   ├── utils.ts                 # cn() class merge helper
│   ├── validation.ts            # isValidUUID(), isValidMediaUrl()
│   └── validators.ts            # Zod schemas + parseBody() for all API inputs
├── stores/
│   ├── appStore.ts              # Single Zustand store (profile, friends, messages, coins, location, presence)
│   └── selectors.ts             # 25+ memoized selector hooks
└── types/
    ├── database.ts              # All entity types + hasRole(), isPremium() helpers
    └── native.d.ts              # Window interface for native bridge
```

---

## API Routes

### Auth & Account
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/profile` | POST | Create/fetch profile after auth |
| `/api/account/delete` | POST | Soft-delete user account |

### Profile
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/profile` | GET, PATCH | Get/update own profile (includes roles) |
| `/api/profile/[userId]` | GET | View another user's profile via RPC |
| `/api/profile/username` | PATCH | Update username (DB uniqueness constraint) |
| `/api/profile/complete-onboarding` | POST | Requires username + 5 interests |
| `/api/profile/photos` | GET, POST | List/upload photos (max 6) |
| `/api/profile/photos/[photoId]` | PATCH, DELETE | Update metadata / delete photo + storage |
| `/api/profile/interests` | GET, POST | List/add interests (max 5 via DB trigger) |
| `/api/profile/interests/[interestId]` | DELETE | Remove interest |

### Friends
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/friends` | GET, POST | List friends (RPC) / send request (RPC) |
| `/api/friends/[friendshipId]` | PATCH, DELETE | Accept/decline / unfriend (may refund coins) |
| `/api/friends/requests` | GET | Incoming + sent requests with profiles |

### Direct Messages
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/dm/threads` | GET, POST | List threads (RPC) / create or find thread (RPC) |
| `/api/dm/[threadId]` | GET, POST | Get conversation (RPC) / send message (RPC) |
| `/api/dm/[threadId]/messages` | DELETE | Clear all messages in thread |
| `/api/dm/[threadId]/delete` | POST | Hard-delete thread and messages |
| `/api/dm/[threadId]/read` | POST | Mark incoming messages as read |
| `/api/dm/[threadId]/[messageId]` | PATCH, DELETE | Edit (15min window) / soft-delete message |

### Coins
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/coins` | GET | Get coin balance (default: 5) |
| `/api/coins/meeting` | POST | Record meeting, award coins via RPC |

### Stripe
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/stripe/checkout` | POST | Create checkout session |
| `/api/stripe/payment-method-subscribe` | POST | Subscribe with payment method (3DS support) |
| `/api/stripe/price` | GET | Get premium price from Stripe |
| `/api/stripe/portal` | POST | Redirect to billing portal |
| `/api/stripe/webhook` | POST | Handle checkout/subscription events |

### Other
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/interests` | GET | All interest tags (public) |
| `/api/upload` | POST | Upload media to Supabase storage |
| `/api/preload` | GET | Bulk-load all user data on app start |
| `/api/users/[userId]/block` | POST, DELETE | Block/unblock user (RPC) |
| `/api/moderation/photos` | GET | Photo moderation queue (moderator only) |
| `/api/moderation/photos/[photoId]` | PATCH | Approve/reject photo (moderator only) |

---

## Features

### Map & Location
- Real-time location tracking with MapLibre GL
- Nearby user detection within 2km (Haversine formula)
- User pins with clustering (Supercluster)
- Highlighted pin for selected/nearby users
- Nearby user swiper cards
- Meeting detection: coins awarded when friends within 50m

### Messaging
- 1:1 DM threads between users
- Real-time delivery via Supabase CDC
- Read receipts, typing indicators
- Message editing (15-minute window), soft-delete
- Thread clearing and deletion
- Profile enrichment from multiple cache sources

### Friends System
- Send/accept/decline friend requests
- Free users limited to 3 friends
- Unfriending with optional coin refund
- Swipe-to-unfriend gesture on mobile

### Profile
- Photo gallery with moderation workflow (pending/approved/rejected)
- Private photos (blurred for non-premium viewers)
- Interest tags (max 5 from curated list)
- Display name, bio (500 chars), location, username
- Onboarding flow requiring username + 5 interests

### Payments
- Stripe subscription for premium features
- Premium unlocks: unlimited friends, DM non-friends, view private photos
- Checkout, payment method attach, 3D Secure support
- Billing portal for subscription management

### Role System
- Relational model: `roles` table + `user_roles` junction table
- 5 roles: guest, user, subscriber, moderator, admin
- Additive JSONB permissions model
- SQL functions: `user_has_role()`, `get_user_roles()`, `grant_role()`, `revoke_role()`
- Auto-assigns `user` role on signup via trigger

### Moderation
- Photo approval queue for moderators
- Approve/reject with reason tracking

### Native App Support
- iOS/Android WebView bridge
- `isNativeApp()` detection, `postToNative()` communication
- Bearer token auth mode for native clients
- Keyboard visibility detection, zoom prevention

---

## Realtime Subscriptions

| Channel | Table | Events | Purpose |
|---------|-------|--------|---------|
| `global-dm-messages` | `dm_messages` | INSERT, UPDATE | New messages, edits, read status |
| `global-friendships` | `friendships` | ALL | Friend request/accept/unfriend sync |
| `global-profiles` | `profiles` | UPDATE | Profile changes sync |
| Presence (nearby) | - | Presence | Location sharing, nearby detection |
| Presence (online) | - | Presence | Online/offline status |

### Debounce/Throttle
- Thread refetch: 500ms debounce
- Friends refetch: 1500ms debounce
- Geolocation updates: 5000ms debounce
- Visibility change refetch: 30s throttle

---

## Design System

### Fonts
- **Display**: Plus Jakarta Sans (`--font-display`)
- **Body**: Inter (`--font-sans`)

### Custom Theme
- Neumorphic shadows (neu-raised, neu-inset, neu-floating)
- HSL-based color tokens via CSS variables
- Custom border radii (sm: 12px, md: 16px, lg: 24px, xl: 32px, pill: 100px)
- Custom animations: shimmer, pulse-soft, bounce-soft, typing-dot, confetti

### Viewport
- Background: #E0E5EC, Foreground: #2D3748
- No user scaling, viewport-fit: cover (notch support)

---

## Supabase Clients

| Client | Location | Use Case |
|--------|----------|----------|
| `createBrowserClient()` | `lib/supabase/client.ts` | Client components (singleton, respects RLS) |
| `createClient()` | `lib/supabase/server.ts` | API routes/server (respects RLS, cookie + Bearer) |
| `createServiceClient()` | `lib/supabase/server.ts` | Admin ops (bypasses RLS, document reason) |

---

## Business Logic Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_PHOTOS` | 6 | Max profile photos per user |
| `FREE_USER_FRIEND_LIMIT` | 3 | Friend limit for free users |
| `EDIT_WINDOW_MINUTES` | 15 | Message edit time window |
| `MAX_BIO_LENGTH` | 500 | Bio character limit |
| `MAX_MESSAGE_LENGTH` | 4000 | Message character limit |
| `MAX_INTERESTS` | 5 | Max interests per user (DB trigger) |
| Default coin balance | 5 | Starting coins for new users |
