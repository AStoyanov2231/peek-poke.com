import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CALL_TERMINAL_FENCES,
  callSignalCommandSchema,
  messageCreateSchema,
} from "@peekpoke/shared";
import { stripPrivateProfileFields } from "@/lib/client-data";
import { RATE_LIMITS } from "@/lib/constants";
import { initialDisplayNameFor, initialUsernameFor, isTemporaryUsername } from "@/lib/auth-profile";
import { filterBlockedThreads, totalUnreadForThreads } from "@/lib/blocked-data";
import { isSafeInternalRedirect } from "@/lib/internal-redirect";
import { createInviteToken, verifyInviteToken } from "@/lib/invite-token";
import { broadcastPrivateRealtimeEvent, notifyFriendshipChanged } from "@/lib/realtime-broadcast";
import { canonicalStorageUrl, storageObjectFromUrl } from "@/lib/storage-urls";
import {
  accountDeleteSchema,
  dmMessageEditSchema,
  moderationActionSchema,
  interestSchema,
  parseBody,
  photoUpdateSchema,
  usernameSchema,
} from "@/lib/validators";
import { parsePagination } from "@/lib/pagination";
import { profileInterestDeleteFilter } from "@/lib/interest-contract";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.UTC(2026, 6, 13, 8, 0, 0);

describe("signed invite tokens", () => {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  it("round-trips a valid inviter ID", () => {
    const token = createInviteToken(USER_ID, NOW);
    expect(verifyInviteToken(token, NOW)).toBe(USER_ID);
  });

  it("rejects tampering and malformed tokens", () => {
    const token = createInviteToken(USER_ID, NOW);
    expect(verifyInviteToken(`${token.slice(0, -1)}x`, NOW)).toBeNull();
    expect(verifyInviteToken("v1.not-a-uuid.123.bad", NOW)).toBeNull();
    expect(verifyInviteToken("too.few.parts", NOW)).toBeNull();
  });

  it("rejects expired and implausibly future-dated tokens", () => {
    const token = createInviteToken(USER_ID, NOW);
    expect(verifyInviteToken(token, NOW + 31 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(verifyInviteToken(token, NOW - 10 * 60 * 1000)).toBeNull();
  });

  it("fails closed without a signing key or with an invalid inviter", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createInviteToken(USER_ID, NOW)).toThrow(/required/);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    expect(() => createInviteToken("not-a-uuid", NOW)).toThrow(/Invalid inviter/);
  });
});

describe("internal redirect validation", () => {
  it.each(["/", "/onboarding", "/invite/token?tab=profile"])(
    "accepts an internal path: %s",
    (path) => expect(isSafeInternalRedirect(path)).toBe(true)
  );

  it.each([
    undefined,
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "/%2fevil.example",
    "/%5cevil.example",
    "/path\nheader:value",
  ])("rejects an unsafe redirect: %s", (path) => {
    expect(isSafeInternalRedirect(path)).toBe(false);
  });
});

describe("client payload sanitization", () => {
  it("removes operational profile fields recursively without mutating input", () => {
    const input = {
      profile: {
        id: USER_ID,
        username: "safe",
        push_tokens: ["secret"],
        stripe_customer_id: "cus_secret",
        deleted_at: null,
        future_sensitive_column: "private-by-default",
      },
      friends: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          username: "friend",
          nested: { push_tokens: ["also-secret"], visible: true },
        },
      ],
      count: 1,
    };

    expect(stripPrivateProfileFields(input)).toEqual({
      profile: { id: USER_ID, username: "safe" },
      friends: [{ id: "22222222-2222-4222-8222-222222222222", username: "friend" }],
      count: 1,
    });
    expect(input.profile.push_tokens).toEqual(["secret"]);
  });

  it("exposes only a boolean tombstone state for deleted profiles", () => {
    expect(stripPrivateProfileFields({
      id: USER_ID,
      username: "deleted_123456789abc",
      display_name: "Deleted member",
      deleted_at: "2026-07-13T12:00:00.000Z",
      auth_user_id: null,
    })).toEqual({
      id: USER_ID,
      username: "deleted_123456789abc",
      display_name: "Deleted member",
      account_deleted: true,
    });
  });
});

describe("private media references", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  });

  it("persists a stable non-bearer reference that can be signed later", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co/";
    const canonical = canonicalStorageUrl("media", `${USER_ID}/photo name.webp`);
    expect(canonical).toBe(
      `https://project.supabase.co/storage/v1/object/public/media/${USER_ID}/photo%20name.webp`
    );
    expect(canonical).not.toContain("token=");
    expect(storageObjectFromUrl(canonical)).toEqual({
      bucket: "media",
      path: `${USER_ID}/photo name.webp`,
    });
  });
});

describe("private friendship synchronization", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  });

  it("broadcasts once per private user topic without embedding identity data", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    const peerId = "22222222-2222-4222-8222-222222222222";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    await notifyFriendshipChanged(USER_ID, peerId, USER_ID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      body: init?.body,
      authorization: new Headers(init?.headers).get("authorization"),
    }));
    expect(calls.map((call) => call.url).sort()).toEqual([
      `https://project.supabase.co/realtime/v1/api/broadcast/sync%3Auser%3A${USER_ID}/events/friendships-changed?private=true`,
      `https://project.supabase.co/realtime/v1/api/broadcast/sync%3Auser%3A${peerId}/events/friendships-changed?private=true`,
    ].sort());
    expect(calls.every((call) => call.body === JSON.stringify({ changed: true }))).toBe(true);
    expect(calls.every((call) => call.authorization === "Bearer service-secret")).toBe(true);
  });

  it("fails closed when a private Realtime broadcast is not delivered", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      broadcastPrivateRealtimeEvent(`call:${USER_ID}`, "call-signal", { type: "reject" })
    ).resolves.toBe(false);
  });
});

describe("mutating API validation boundaries", () => {
  it("accepts web tag IDs and Expo profile-interest IDs at one delete boundary", () => {
    const webTagId = USER_ID;
    const expoProfileInterestId = "22222222-2222-4222-8222-222222222222";
    expect(interestSchema.safeParse({ tag_id: webTagId }).success).toBe(true);
    expect(profileInterestDeleteFilter(webTagId)).toBe(`id.eq.${webTagId},tag_id.eq.${webTagId}`);
    expect(profileInterestDeleteFilter(expoProfileInterestId)).toBe(
      `id.eq.${expoProfileInterestId},tag_id.eq.${expoProfileInterestId}`
    );
  });

  it("rejects oversized JSON bodies and invalid page sizes deterministically", async () => {
    const oversized = new Request("https://example.test/api/profile", {
      method: "POST",
      body: "x".repeat(128 * 1024 + 1),
    });
    const [, bodyError] = await parseBody(oversized, interestSchema);
    const pagination = parsePagination(new Request("https://example.test/api/moderation/photos?limit=101"));
    expect(bodyError?.status).toBe(413);
    expect(pagination.error?.status).toBe(400);
  });

  it("applies the same 4,000-character limit when sending and editing messages", () => {
    const maximum = "x".repeat(4000);
    const tooLong = `${maximum}x`;

    expect(messageCreateSchema.safeParse({ client_id: USER_ID, content: maximum }).success).toBe(true);
    expect(dmMessageEditSchema.safeParse({ content: maximum }).success).toBe(true);
    expect(messageCreateSchema.safeParse({ client_id: USER_ID, content: tooLong }).success).toBe(false);
    expect(dmMessageEditSchema.safeParse({ content: tooLong }).success).toBe(false);
  });

  it("accepts only bounded call signals and rate-limits push-generating invites", () => {
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "invite",
      commandId: USER_ID,
      callId: USER_ID,
    }).success).toBe(true);
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "answer",
      commandId: USER_ID,
      callId: USER_ID,
    }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "invite",
      commandId: USER_ID,
      callId: USER_ID,
      recipient: USER_ID,
    }).success).toBe(false);
    expect(RATE_LIMITS.callInvite).toEqual({ limit: 5, window: 60 });
    expect(RATE_LIMITS.callInviteRecipient).toEqual({ limit: 5, window: 60 });
    expect(MAX_CALL_TERMINAL_FENCES).toBeGreaterThan(
      RATE_LIMITS.callInvite.limit + RATE_LIMITS.callInviteRecipient.limit,
    );
  });

  it("requires an explicit destructive account-deletion confirmation", () => {
    expect(accountDeleteSchema.safeParse({ confirmation: "DELETE" }).success).toBe(true);
    expect(accountDeleteSchema.safeParse({ confirmation: "delete" }).success).toBe(false);
    expect(accountDeleteSchema.safeParse({ confirmation: "DELETE", user_id: USER_ID }).success).toBe(false);
    expect(RATE_LIMITS.accountDelete).toEqual({ limit: 5, window: 3_600 });
  });

  it("rejects ambiguous photo mutations and oversized moderation reasons", () => {
    expect(photoUpdateSchema.safeParse({ is_private: true }).success).toBe(true);
    expect(photoUpdateSchema.safeParse({ is_avatar: true }).success).toBe(true);
    expect(photoUpdateSchema.safeParse({}).success).toBe(false);
    expect(photoUpdateSchema.safeParse({ is_avatar: true, is_private: true }).success).toBe(false);
    expect(photoUpdateSchema.safeParse({ display_order: -1 }).success).toBe(false);
    expect(moderationActionSchema.safeParse({ action: "reject", reason: "x".repeat(1001) }).success).toBe(false);
  });

  it("recognizes legacy and current generated usernames and reserves them", () => {
    expect(isTemporaryUsername("user_deadbeef")).toBe(true);
    expect(isTemporaryUsername("user_deadbeef1234567")).toBe(true);
    expect(isTemporaryUsername("user_personal_name")).toBe(false);
    expect(usernameSchema.safeParse({ username: "user_deadbeef" }).success).toBe(false);
    expect(usernameSchema.safeParse({ username: "chosen_name" }).success).toBe(true);
  });

  it("does not let Auth metadata claim a username and bounds display names", () => {
    const user = {
      id: USER_ID,
      user_metadata: {
        username: "claimed_name",
        full_name: `  ${"x".repeat(80)}  `,
      },
    } as never;

    expect(initialUsernameFor(user)).toBe("user_111111111111411");
    expect(initialDisplayNameFor(user)).toBe("x".repeat(50));
  });
});

describe("bidirectional block response boundaries", () => {
  it("removes threads involving either direction of a block and recomputes unread state", () => {
    const blockedId = "22222222-2222-4222-8222-222222222222";
    const allowedId = "33333333-3333-4333-8333-333333333333";
    const threads = [
      { participant_1_id: USER_ID, participant_2_id: blockedId, unread_count: 8 },
      { participant_1_id: allowedId, participant_2_id: USER_ID, unread_count: 2 },
    ];

    const visible = filterBlockedThreads(threads, new Set([blockedId]));
    expect(visible).toEqual([threads[1]]);
    expect(totalUnreadForThreads(visible)).toBe(2);
  });
});
