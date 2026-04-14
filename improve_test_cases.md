# Test Coverage Improvements

Overall: **stmt 57.5% / branch 45.9% / fn 66.7%**

How to use this file:
> "Cover `<path>`. Current coverage: stmt X% branch Y% fn Z%."

---

## Zero Coverage (no tests exist)

| File | stmt | branch | fn |
|------|------|--------|----|
| `src/app/api/auth/profile/route.ts` | 0% | 0% | 0% |
| `src/app/api/dm/[threadId]/delete/route.ts` | 0% | 0% | 0% |
| `src/app/api/dm/[threadId]/messages/route.ts` | 0% | 0% | 0% |
| `src/app/api/friends/requests/route.ts` | 0% | 0% | 0% |
| `src/app/api/interests/route.ts` | 0% | 0% | 0% |
| `src/app/api/preload/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/[userId]/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/complete-onboarding/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/interests/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/interests/[interestId]/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/photos/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/photos/[photoId]/route.ts` | 0% | 0% | 0% |
| `src/app/api/profile/username/route.ts` | 0% | 0% | 0% |
| `src/app/api/stripe/payment-method-subscribe/route.ts` | 0% | 0% | 0% |
| `src/app/api/stripe/portal/route.ts` | 0% | 0% | 0% |
| `src/app/api/stripe/price/route.ts` | 0% | 0% | 0% |
| `src/app/api/users/[userId]/block/route.ts` | 0% | 0% | 0% |
| `src/hooks/useKeyboardVisible.ts` | 0% | 0% | 0% |
| `src/hooks/useRealtimeFriendships.ts` | 0% | 0% | 0% |
| `src/hooks/useRealtimeProfiles.ts` | 0% | 0% | 0% |
| `src/hooks/useTransitionRouter.ts` | 0% | 0% | 0% |
| `src/lib/preload.ts` | 0% | 0% | 0% |

---

## Partial Coverage (tests exist, branches/paths missing)

| File | stmt | branch | fn |
|------|------|--------|----|
| `src/app/api/dm/[threadId]/route.ts` | 72% | 68.8% | 100% |
| `src/app/api/dm/[threadId]/[messageId]/route.ts` | 75% | 75% | 100% |
| `src/app/api/friends/route.ts` | 94.1% | 70% | 100% |
| `src/app/api/friends/[friendshipId]/route.ts` | 65.4% | 45.8% | 100% |
| `src/app/api/moderation/photos/route.ts` | 84.6% | 77.8% | 100% |
| `src/app/api/moderation/photos/[photoId]/route.ts` | 78.9% | 75% | 100% |
| `src/app/api/profile/route.ts` | 100% | 70% | 100% |
| `src/app/api/coins/meeting/route.ts` | 100% | 77.8% | 100% |
| `src/app/api/stripe/checkout/route.ts` | 91.7% | 91.7% | 100% |
| `src/hooks/useAuth.ts` | 76.3% | 53.1% | 100% |
| `src/hooks/useNearbyPresence.ts` | 79.3% | 58.5% | 87.5% |
| `src/hooks/usePresence.ts` | 77.4% | 50% | 70% |
| `src/hooks/useRealtimeDM.ts` | 84.8% | 62.3% | 76.5% |
| `src/lib/email-validation.ts` | 88.5% | 81.3% | 100% |
| `src/lib/native.ts` | 87.5% | 87.5% | 100% |
| `src/lib/stripe-webhook.ts` | 83.9% | 73.8% | 100% |
