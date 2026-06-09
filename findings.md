# Is Peek & Poke ready for the world? 🚦

*A deep checkup, explained simply.*

**Date:** 2026-06-02

---

## The short answer

**Almost — but not quite yet.** 🟡

Think of the app like a car. The engine runs great, the seats are clean, and it
passes the safety test. But a few important things still need fixing before you
drive it on the highway with passengers. None are huge. Most are quick.

---

## ✅ What's already great (the good news)

| Thing | Why it's good |
|---|---|
| 🟢 **The code builds** | TypeScript check passed with zero errors. |
| 🟢 **All tests pass** | 478 tests, 36 files — every single one passed. |
| 🟢 **Tidy code** | Lint passed clean. Almost no `any`, no `@ts-ignore`, no dead code. |
| 🟢 **Secrets are safe** | Your passwords/keys are **not** in the code history. They're hidden properly. |
| 🟢 **Logins are guarded** | API routes check "are you allowed?" before doing things. |
| 🟢 **Bad input is blocked** | User text is checked, and the XSS hole was fixed. |
| 🟢 **Stripe is verified** | Payment messages are checked to be real before trusting them. |
| 🟢 **Old dating feature** | Fully removed — no leftover junk. |

---

## 🔴 Must fix before launch (the big rocks)

1. **The database has no "save file."**
   Your tables and rules live only inside Supabase's website. There's no copy in
   the project. If something breaks, you can't rebuild it. → *Add a
   `supabase/migrations` folder and save the schema there.*

2. **No "smoke alarm" for errors.**
   If the app breaks for a real user, **nobody gets told.** → *Add error
   monitoring like Sentry.*

3. **Swap test keys for real keys.**
   Stripe is using **test** keys (`sk_test_…`). Real money won't work until you
   put the **live** keys into Vercel. → *Set live keys on Vercel, not locally.*

4. **Add a security helmet (CSP).**
   A "Content-Security-Policy" header is missing. (Your notes say it exists, but
   it doesn't — `next.config.ts` has none.) This helps stop hackers from stealing
   logins. → *Add the CSP header.*

---

## 🟠 Should fix soon (medium rocks)

5. **No "slow down" limits (rate limiting).**
   Someone could spam messages, friend requests, or coins very fast. → *Add rate
   limiting to busy endpoints (DM, friends, coins, location).*

6. **Some actions aren't "all-or-nothing."**
   Deleting photos, clearing chats, and setting avatars happen in steps. If one
   step fails halfway, data gets messy. (4 `TODO` notes already mention this.)
   → *Wrap them in single database functions (RPCs).*

7. **You can block, but you can't unblock.**
   The "unblock" feature isn't built yet. → *Add an `unblock_user()` function.*

---

## 🟡 Nice to fix (small pebbles)

8. **No `.env.example` file.** A new helper won't know which secret keys are
   needed. → *Add one listing the required variables.*
9. **Missing HSTS header** (forces secure https). → *Add it.*
10. **A dev computer's IP** (`192.168.100.2`) is hardcoded in config. Harmless in
    production, but messy. → *Move it to dev-only.*
11. **No analytics or `robots.txt`.** You won't see how people use the app, and
    search engines have no guidance. → *Optional, add if you want.*

---

## 🎯 The bottom line

The **inside** of the app (code, tests, logins, input safety) is in **good
shape**. The gaps are mostly around **going live**: backups, error alarms, live
payment keys, and abuse protection.

**Do the 4 "Must fix" items first.** After that, you're ready to launch. 🚀

*Rough time to handle the must-fixes: about half a day to a day.*
