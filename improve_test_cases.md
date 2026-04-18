# Test Coverage Improvements

Overall: **stmt 90.16% / branch 81.79% / fn 83.33%**

How to use this file:
> "Cover `<path>`. Current coverage: stmt X% branch Y% fn Z%."

---

## Zero Coverage (no tests exist)

| File | stmt | branch | fn |
|------|------|--------|----|
| `src/hooks/useKeyboardVisible.ts` | 0% | 0% | 0% |
| `src/hooks/useRealtimeFriendships.ts` | 0% | 0% | 0% |
| `src/hooks/useRealtimeProfiles.ts` | 0% | 0% | 0% |
| `src/hooks/useTransitionRouter.ts` | 0% | 0% | 0% |
| `src/lib/preload.ts` | 0% | 0% | 0% |
| `src/lib/supabase` | 0% | 0% | 0% |

---

## Partial Coverage (tests exist, branches/paths missing)

| File | stmt | branch | fn |
|------|------|--------|----|
| `src/app/api/dm/[threadId]/[messageId]/route.ts` | 97.72% | 97.22% | 100% |
| `src/app/api/friends/route.ts` | 100% | 90% | 100% |
| `src/app/api/friends/[friendshipId]/route.ts` | 96.15% | 83.33% | 100% |
| `src/app/api/moderation/photos/route.ts` | 100% | 83.33% | 100% |
| `src/app/api/moderation/photos/[photoId]/route.ts` | 94.73% | 87.5% | 100% |
| `src/app/api/coins/meeting/route.ts` | 100% | 94.44% | 100% |
| `src/app/api/stripe/payment-method-subscribe/route.ts` | 100% | 93.75% | 100% |
| `src/app/api/users/[userId]/block/route.ts` | 100% | 91.66% | 100% |
| `src/hooks/useAuth.ts` | 76.3% | 53.1% | 100% |
| `src/hooks/useNearbyPresence.ts` | 79.3% | 58.5% | 87.5% |
| `src/hooks/usePresence.ts` | 77.4% | 50% | 70% |
| `src/hooks/useRealtimeDM.ts` | 84.8% | 62.3% | 76.5% |
| `src/lib/email-validation.ts` | 88.5% | 81.3% | 100% |
| `src/lib/native.ts` | 87.5% | 87.5% | 100% |
| `src/lib/stripe-webhook.ts` | 83.9% | 73.8% | 100% |
| `src/stores` | 77.5% | 54.71% | 74.82% |
