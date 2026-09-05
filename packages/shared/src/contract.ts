import { z } from "zod";
import type { SearchUserResult } from "./search";
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from "./constants";

export const API_VERSION = "v1" as const;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_PAGE_SIZE = 50;
export const MAX_CURSOR_BYTES = 512;

export const utcTimestampSchema = z.iso.datetime({ offset: true });
export const cursorSchema = z.string().min(1).max(MAX_CURSOR_BYTES);
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const UNSAFE_DISPLAY_NAME_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B\u200C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;

export function canonicalizeDisplayName(value: string) {
  return value.trim().normalize("NFC");
}

export function displayNameLength(value: string) {
  return Array.from(value).length;
}

function addDisplayNameIssues(value: string, context: z.RefinementCtx) {
  if (value.length === 0) {
    context.addIssue({ code: "custom", message: "Display name is required" });
  }
  if (displayNameLength(value) > MAX_DISPLAY_NAME_LENGTH) {
    context.addIssue({
      code: "custom",
      message: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`,
    });
  }
  if (UNSAFE_DISPLAY_NAME_CHARACTERS.test(value)) {
    context.addIssue({
      code: "custom",
      message: "Display name contains unsupported control characters",
    });
  }
}

/** Canonical request input: Unicode NFC, surrounding whitespace removed. */
export const displayNameInputSchema = z
  .string()
  .transform(canonicalizeDisplayName)
  .superRefine(addDisplayNameIssues);

/** Strict server response value. Responses must already be canonical. */
export const displayNameSchema = z.string().superRefine((value, context) => {
  addDisplayNameIssues(value, context);
  if (value !== canonicalizeDisplayName(value)) {
    context.addIssue({ code: "custom", message: "Display name is not canonical" });
  }
});

export const inviteTokenSchema = z.string().regex(
  /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.\d{10}\.[A-Za-z0-9_-]{43}$/i,
);

const absoluteInviteUrlSchema = z.url().superRefine((value, context) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    context.addIssue({ code: "custom", message: "Invite URL must be absolute" });
    return;
  }

  const token = url.pathname.startsWith("/invite/")
    ? url.pathname.slice("/invite/".length)
    : "";
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
    || url.search
    || url.hash
    || !inviteTokenSchema.safeParse(token).success
  ) {
    context.addIssue({ code: "custom", message: "Invalid invite URL" });
  }
});

export const inviteLinkResponseSchema = z.strictObject({
  invite_url: absoluteInviteUrlSchema,
});

const DEVELOPMENT_INVITE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "10.0.2.2",
]);

export function isAllowedInviteOrigin(expectedOrigin: string, allowDevelopmentHttp = false) {
  try {
    const expected = new URL(expectedOrigin);
    if (expected.protocol === "https:") return true;
    return expected.protocol === "http:"
      && allowDevelopmentHttp
      && DEVELOPMENT_INVITE_HOSTS.has(expected.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function inviteLinkResponseSchemaForOrigin(
  expectedOrigin: string,
  options: { allowDevelopmentHttp?: boolean } = {},
) {
  let expected: URL | null = null;
  try {
    expected = new URL(expectedOrigin);
  } catch {
    // The returned schema rejects every payload when its trust anchor is invalid.
  }
  const allowedOrigin = isAllowedInviteOrigin(
    expectedOrigin,
    options.allowDevelopmentHttp === true,
  );

  return inviteLinkResponseSchema.superRefine((value, context) => {
    if (!expected || !allowedOrigin || new URL(value.invite_url).origin !== expected.origin) {
      context.addIssue({
        code: "custom",
        path: ["invite_url"],
        message: "Invite URL origin does not match the expected app origin",
      });
    }
  });
}

export const inviteAcceptanceResponseSchema = z.strictObject({
  profile_id: z.uuid(),
});

export type InviteLinkResponse = z.infer<typeof inviteLinkResponseSchema>;
export type InviteAcceptanceResponse = z.infer<typeof inviteAcceptanceResponseSchema>;

export function inviteAcceptanceResponseSchemaFor(inviterId: string) {
  return inviteAcceptanceResponseSchema.superRefine((value, context) => {
    if (value.profile_id !== inviterId) {
      context.addIssue({
        code: "custom",
        path: ["profile_id"],
        message: "Invite response profile does not match inviter",
      });
    }
  });
}

export function inviterIdFromInviteToken(token: string): string | null {
  if (!inviteTokenSchema.safeParse(token).success) return null;
  return token.split(".")[1] ?? null;
}

export function inviteAcceptanceResponseSchemaForToken(token: string) {
  const inviterId = inviterIdFromInviteToken(token);
  return inviterId
    ? inviteAcceptanceResponseSchemaFor(inviterId)
    : z.never();
}

const profileCardShape = {
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema.nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
  roles: z.array(z.string()).optional(),
  account_deleted: z.boolean().optional(),
};

export const profileCardSchema = z.object(profileCardShape);
const friendshipProfileCardSchema = z.strictObject(profileCardShape);
export const profileViewSchema = profileCardSchema.extend({
  bio: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  created_at: utcTimestampSchema,
  onboarding_completed: z.boolean(),
  roles: z.array(z.string()),
});

export const roleNameSchema = z.enum([
  "guest",
  "user",
  "subscriber",
  "platinum",
  "moderator",
  "admin",
]);

export const currentProfileSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema.nullable(),
  bio: z.string().nullable(),
  avatar_url: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema,
  created_at: utcTimestampSchema,
  onboarding_completed: z.boolean(),
  roles: z.array(roleNameSchema),
});

export const interestTagSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  category: z.string().min(1),
  icon: z.string().nullable(),
  display_order: z.number().int().nonnegative(),
});

export const profileInterestSchema = z.strictObject({
  id: z.uuid(),
  user_id: z.uuid(),
  tag_id: z.uuid(),
  created_at: utcTimestampSchema,
  tag: interestTagSchema,
});

export const currentProfileResponseSchema = z.strictObject({
  profile: currentProfileSchema.nullable(),
});

export const ownerProfilePatchRequestSchema = z
  .strictObject({
    display_name: displayNameInputSchema.optional(),
    bio: z.string().max(MAX_BIO_LENGTH, `Bio must be ${MAX_BIO_LENGTH} characters or less`).optional(),
    location_text: z.string().max(100, "Location must be 100 characters or less").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one profile change");

export const ownerProfileUpdateResponseSchema = z.strictObject({
  profile: currentProfileSchema,
});

export const interestCatalogResponseSchema = z.strictObject({
  tags: z.array(interestTagSchema),
});

export const profileInterestsResponseSchema = z.strictObject({
  interests: z.array(profileInterestSchema),
});

export const profileInterestCreateResponseSchema = z.strictObject({
  interest: profileInterestSchema,
});

export const profileInterestDeleteResponseSchema = z.strictObject({
  success: z.literal(true),
});

const httpImageUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
  ) {
    context.addIssue({ code: "custom", message: "Invalid image URL" });
  }
});

const PRIVATE_PROFILE_MEDIA_BUCKETS = new Set([
  "private-profile-photos",
  "profile-media-quarantine",
  "profile-photos",
]);

function signedProfilePhotoBucket(value: string, ownerId: string) {
  try {
    const url = new URL(value);
    const prefix = "/storage/v1/object/sign/";
    const signedPath = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
    const slash = signedPath.indexOf("/");
    const bucket = slash >= 0 ? signedPath.slice(0, slash) : "";
    const objectPath = slash >= 0 ? signedPath.slice(slash + 1) : "";
    const segments = objectPath.split("/");
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && PRIVATE_PROFILE_MEDIA_BUCKETS.has(bucket)
      && !objectPath.includes("%")
      && !objectPath.includes("\\")
      && segments.length >= 2
      && segments[0] === ownerId
      && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
      && url.searchParams.getAll("token").length === 1
      && Boolean(url.searchParams.get("token"))
      ? bucket
      : null;
  } catch {
    return null;
  }
}

function isPrivateProfilePhotoSignedUrl(value: string, ownerId: string) {
  return signedProfilePhotoBucket(value, ownerId) === "private-profile-photos";
}

function isQuarantinedProfilePhotoSignedUrl(value: string, ownerId: string) {
  const bucket = signedProfilePhotoBucket(value, ownerId);
  return bucket === "profile-media-quarantine" || bucket === "profile-photos";
}

function isPublicProfilePhotoUrl(value: string, ownerId: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(
      /^\/storage\/v1\/object\/public\/(?:approved-profile-photos|profile-photos)\/(.+)$/,
    );
    const objectPath = match?.[1] ?? "";
    const segments = objectPath.split("/");
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !objectPath.includes("%")
      && !objectPath.includes("\\")
      && segments.length >= 2
      && segments[0] === ownerId
      && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
      && url.searchParams.getAll("token").length === 0;
  } catch {
    return false;
  }
}

function isPrivateProfilePhotoMediaUrl(value: string) {
  try {
    return /^\/storage\/v1\/object\/(?:public|sign)\/private-profile-photos(?:\/|$)/.test(
      new URL(value).pathname,
    );
  } catch {
    return false;
  }
}

const profilePhotoBaseShape = {
  id: z.uuid(),
  user_id: z.uuid(),
  is_avatar: z.boolean(),
  is_cover: z.boolean(),
  is_private: z.boolean(),
  display_order: z.number().int().nonnegative(),
  created_at: utcTimestampSchema,
};

function hasStorageOrigin(value: string | null, configuredOrigin: string) {
  if (value === null) return true;
  try {
    const configured = new URL(configuredOrigin);
    const candidate = new URL(value);
    return configured.protocol === "https:"
      && candidate.protocol === "https:"
      && configured.origin === candidate.origin;
  } catch {
    return false;
  }
}

function validatePhotoStorageOrigin(
  photo: { url: string | null; thumbnail_url: string | null },
  configuredOrigin: string,
  context: z.RefinementCtx,
  pathPrefix: (string | number)[] = [],
) {
  if (!hasStorageOrigin(photo.url, configuredOrigin)) {
    context.addIssue({
      code: "custom",
      path: [...pathPrefix, "url"],
      message: "Photo URL does not match configured storage origin",
    });
  }
  if (!hasStorageOrigin(photo.thumbnail_url, configuredOrigin)) {
    context.addIssue({
      code: "custom",
      path: [...pathPrefix, "thumbnail_url"],
      message: "Photo thumbnail URL does not match configured storage origin",
    });
  }
}

export const ownerProfilePhotoSchema = z.strictObject({
  ...profilePhotoBaseShape,
  url: httpImageUrlSchema.nullable(),
  thumbnail_url: httpImageUrlSchema.nullable(),
  approval_status: z.enum(["pending", "approved", "rejected"]),
  rejection_reason: z.string().nullable(),
}).superRefine((photo, context) => {
  if ((photo.is_avatar || photo.is_cover) && photo.is_private) {
    context.addIssue({
      code: "custom",
      path: [photo.is_avatar ? "is_avatar" : "is_cover"],
      message: "Private photos cannot be featured profile media",
    });
  }
  if (photo.approval_status === "rejected") {
    if (photo.url !== null || photo.thumbnail_url !== null) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Rejected profile photos cannot expose media URLs",
      });
    }
    return;
  }
  if (photo.url === null) {
    context.addIssue({ code: "custom", path: ["url"], message: "Available photos require a URL" });
    return;
  }
  if (photo.approval_status === "pending" && !isQuarantinedProfilePhotoSignedUrl(photo.url, photo.user_id)) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "Pending profile photos require a signed quarantine URL",
    });
  } else if (photo.approval_status === "approved" && photo.is_private && !isPrivateProfilePhotoSignedUrl(photo.url, photo.user_id)) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "Private profile photos require a signed URL",
    });
  } else if (
    photo.approval_status === "approved"
    && !photo.is_private
    && !isPublicProfilePhotoUrl(photo.url, photo.user_id)
    && !isQuarantinedProfilePhotoSignedUrl(photo.url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "Public profile photos require an owner-bound public URL",
    });
  }
  if (
    photo.approval_status === "pending"
    && photo.thumbnail_url !== null
    && !isQuarantinedProfilePhotoSignedUrl(photo.thumbnail_url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["thumbnail_url"],
      message: "Pending profile thumbnails require a signed quarantine URL",
    });
  } else if (
    photo.approval_status === "approved"
    && photo.is_private
    && photo.thumbnail_url !== null
    && !isPrivateProfilePhotoSignedUrl(photo.thumbnail_url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["thumbnail_url"],
      message: "Private profile thumbnails require a signed URL",
    });
  } else if (
    photo.approval_status === "approved"
    && !photo.is_private
    && photo.thumbnail_url !== null
    && !isPublicProfilePhotoUrl(photo.thumbnail_url, photo.user_id)
    && !isQuarantinedProfilePhotoSignedUrl(photo.thumbnail_url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["thumbnail_url"],
      message: "Public profile thumbnails require an owner-bound public URL",
    });
  }
});

export const publicProfilePhotoSchema = z.strictObject({
  ...profilePhotoBaseShape,
  url: httpImageUrlSchema.nullable(),
  thumbnail_url: httpImageUrlSchema.nullable(),
  approval_status: z.literal("approved"),
  access: z.enum(["viewable", "locked"]),
}).superRefine((photo, context) => {
  if ((photo.is_avatar || photo.is_cover) && photo.is_private) {
    context.addIssue({
      code: "custom",
      path: [photo.is_avatar ? "is_avatar" : "is_cover"],
      message: "Private photos cannot be featured profile media",
    });
  }
  if (photo.access === "locked") {
    if (!photo.is_private || photo.url !== null || photo.thumbnail_url !== null) {
      context.addIssue({
        code: "custom",
        path: ["access"],
        message: "Locked photos cannot expose media URLs",
      });
    }
    return;
  }

  if (photo.url === null) {
    context.addIssue({ code: "custom", path: ["url"], message: "Viewable photos require a URL" });
  } else if (photo.is_private && !isPrivateProfilePhotoSignedUrl(photo.url, photo.user_id)) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "Private profile photos require a signed URL",
    });
  } else if (
    !photo.is_private
    && !isPublicProfilePhotoUrl(photo.url, photo.user_id)
    && !isQuarantinedProfilePhotoSignedUrl(photo.url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "Public profile photos require an owner-bound public URL",
    });
  }
  if (
    photo.is_private
    && photo.thumbnail_url !== null
    && !isPrivateProfilePhotoSignedUrl(photo.thumbnail_url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["thumbnail_url"],
      message: "Private profile thumbnails require a signed URL",
    });
  } else if (
    !photo.is_private
    && photo.thumbnail_url !== null
    && !isPublicProfilePhotoUrl(photo.thumbnail_url, photo.user_id)
    && !isQuarantinedProfilePhotoSignedUrl(photo.thumbnail_url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["thumbnail_url"],
      message: "Public profile thumbnails require an owner-bound public URL",
    });
  }
});

export const publicProfileSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema.nullable(),
  bio: z.string().nullable(),
  avatar_url: httpImageUrlSchema.nullable(),
  cover_image_url: httpImageUrlSchema.nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
  created_at: utcTimestampSchema,
  is_premium: z.boolean(),
}).superRefine((profile, context) => {
  for (const field of ["avatar_url", "cover_image_url"] as const) {
    const value = profile[field];
    if (value !== null && isPrivateProfilePhotoMediaUrl(value)) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: "Public profile media cannot reference private profile-photo storage",
      });
    }
  }
});

export const publicProfileStatsSchema = z.strictObject({
  photos_count: z.number().int().nonnegative(),
  friends_count: z.number().int().nonnegative(),
});

export const publicProfileRelationshipSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.enum(["pending", "accepted"]),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
});

export const onboardingCompleteProfileSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  onboarding_completed: z.literal(true),
});

export const onboardingCompleteResponseSchema = z.strictObject({
  success: z.literal(true),
  profile: onboardingCompleteProfileSchema,
});

export const friendSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.enum(["pending", "accepted"]),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  requester: friendshipProfileCardSchema.optional(),
  addressee: friendshipProfileCardSchema.optional(),
}).superRefine((friend, context) => {
  if (friend.requester_id === friend.addressee_id) {
    context.addIssue({
      code: "custom",
      path: ["addressee_id"],
      message: "Friendship participants must be distinct",
    });
  }
});

export const friendshipCreateRequestSchema = z.strictObject({
  addressee_id: z.uuid(),
});

const friendshipPageInfoSchema = z.strictObject({
  version: z.literal(API_VERSION),
  next_cursor: cursorSchema.nullable(),
  has_more: z.boolean(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
}).superRefine((page, context) => {
  if (page.has_more !== (page.next_cursor !== null)) {
    context.addIssue({
      code: "custom",
      path: ["next_cursor"],
      message: "Friendship pagination cursor does not match has_more",
    });
  }
});

const acceptedFriendSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("accepted"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  requester: friendshipProfileCardSchema,
  addressee: friendshipProfileCardSchema,
}).refine((friend) => friend.requester_id !== friend.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const incomingFriendRequestSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("pending"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  requester: friendshipProfileCardSchema,
}).refine((friend) => friend.requester_id !== friend.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const sentFriendRequestSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("pending"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  addressee: friendshipProfileCardSchema,
}).refine((friend) => friend.requester_id !== friend.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const friendshipReadPaginationSchema = z.strictObject({
  friends: friendshipPageInfoSchema,
  requests: friendshipPageInfoSchema,
  sentRequests: friendshipPageInfoSchema,
});

const friendshipRequestsPaginationSchema = z.strictObject({
  requests: friendshipPageInfoSchema,
  sentRequests: friendshipPageInfoSchema,
});

function duplicateValue(values: readonly string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function validateFriendshipReadSemantics(
  value: {
    viewer_id: string;
    requests: z.infer<typeof incomingFriendRequestSchema>[];
    sentRequests: z.infer<typeof sentFriendRequestSchema>[];
    sentRequestUserIds?: string[];
    friends?: z.infer<typeof acceptedFriendSchema>[];
    pagination: {
      friends?: z.infer<typeof friendshipPageInfoSchema>;
      requests: z.infer<typeof friendshipPageInfoSchema>;
      sentRequests: z.infer<typeof friendshipPageInfoSchema>;
    };
  },
  context: z.RefinementCtx,
) {
  const rows = [...(value.friends ?? []), ...value.requests, ...value.sentRequests];
  const duplicateId = duplicateValue(rows.map((row) => row.id));
  if (duplicateId) {
    context.addIssue({ code: "custom", path: ["friends"], message: "Duplicate friendship row" });
  }

  for (const [index, friend] of (value.friends ?? []).entries()) {
    const viewerMatches = Number(friend.requester_id === value.viewer_id)
      + Number(friend.addressee_id === value.viewer_id);
    if (
      viewerMatches !== 1
      || friend.requester.id !== friend.requester_id
      || friend.addressee.id !== friend.addressee_id
    ) {
      context.addIssue({ code: "custom", path: ["friends", index], message: "Invalid viewer-bound friend" });
    }
  }

  for (const [index, request] of value.requests.entries()) {
    if (request.addressee_id !== value.viewer_id || request.requester.id !== request.requester_id) {
      context.addIssue({ code: "custom", path: ["requests", index], message: "Invalid incoming request" });
    }
  }

  for (const [index, request] of value.sentRequests.entries()) {
    if (request.requester_id !== value.viewer_id || request.addressee.id !== request.addressee_id) {
      context.addIssue({ code: "custom", path: ["sentRequests", index], message: "Invalid sent request" });
    }
  }

  const peerIds = [
    ...(value.friends ?? []).flatMap((friend) => {
      if (friend.requester_id === value.viewer_id && friend.addressee_id !== value.viewer_id) {
        return [friend.addressee_id];
      }
      if (friend.addressee_id === value.viewer_id && friend.requester_id !== value.viewer_id) {
        return [friend.requester_id];
      }
      return [];
    }),
    ...value.requests.map((request) => request.requester_id),
    ...value.sentRequests.map((request) => request.addressee_id),
  ];
  if (duplicateValue(peerIds)) {
    context.addIssue({
      code: "custom",
      path: ["friends"],
      message: "Duplicate friendship peer",
    });
  }

  const collectionLimits = [
    ["friends", value.friends, value.pagination.friends],
    ["requests", value.requests, value.pagination.requests],
    ["sentRequests", value.sentRequests, value.pagination.sentRequests],
  ] as const;
  for (const [key, items, page] of collectionLimits) {
    if (items && page && items.length > page.limit) {
      context.addIssue({ code: "custom", path: [key], message: "Friendship page exceeds its limit" });
    }
  }

  if (value.sentRequestUserIds) {
    const expected = value.sentRequests.map((request) => request.addressee_id);
    if (
      duplicateValue(expected)
      || value.sentRequestUserIds.length !== expected.length
      || value.sentRequestUserIds.some((id, index) => id !== expected[index])
    ) {
      context.addIssue({
        code: "custom",
        path: ["sentRequestUserIds"],
        message: "Sent request user IDs do not exactly match sent requests",
      });
    }
  }
}

export const friendsReadResponseSchema = z.strictObject({
  viewer_id: z.uuid(),
  friends: z.array(acceptedFriendSchema).max(MAX_PAGE_SIZE),
  requests: z.array(incomingFriendRequestSchema).max(MAX_PAGE_SIZE),
  sentRequests: z.array(sentFriendRequestSchema).max(MAX_PAGE_SIZE),
  sentRequestUserIds: z.array(z.uuid()).max(MAX_PAGE_SIZE),
  pagination: friendshipReadPaginationSchema,
}).superRefine(validateFriendshipReadSemantics);

export const friendRequestsReadResponseSchema = z.strictObject({
  viewer_id: z.uuid(),
  requests: z.array(incomingFriendRequestSchema).max(MAX_PAGE_SIZE),
  sentRequests: z.array(sentFriendRequestSchema).max(MAX_PAGE_SIZE),
  pagination: friendshipRequestsPaginationSchema,
}).superRefine(validateFriendshipReadSemantics);

export const friendshipCreateResponseSchema = z.strictObject({
  friendship: friendSchema.safeExtend({ status: z.literal("pending") }),
  balance: z.number().int().nonnegative(),
});

export const friendshipResponseRequestSchema = z.strictObject({
  status: z.enum(["accepted", "declined"]),
});

export const friendshipResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("accepted"),
    friendship: friendSchema.safeExtend({ status: z.literal("accepted") }),
  }),
  z.strictObject({
    status: z.literal("declined"),
    friendship: z.null(),
  }),
]);

export const friendshipRemovalResponseSchema = z.discriminatedUnion("refunded", [
  z.strictObject({
    success: z.literal(true),
    refunded: z.literal(true),
    balance: z.number().int().nonnegative(),
  }),
  z.strictObject({
    success: z.literal(true),
    refunded: z.literal(false),
    balance: z.null(),
  }),
]);

export const blockUserResponseSchema = friendshipRemovalResponseSchema;

export const coinsResponseSchema = z.strictObject({
  balance: z.number().int().nonnegative(),
});

export const meetingRequestSchema = z.strictObject({
  friend_id: z.uuid(),
});

export const meetingResponseSchema = z.discriminatedUnion("already_met", [
  z.strictObject({
    success: z.literal(true),
    awarded: z.literal(false),
    already_met: z.literal(true),
    balance: z.null(),
  }),
  z.strictObject({
    success: z.literal(true),
    awarded: z.boolean(),
    already_met: z.literal(false),
    balance: z.number().int().nonnegative(),
  }),
]);

export const threadSummarySchema = z.object({
  id: z.uuid(),
  participant_1_id: z.uuid(),
  participant_2_id: z.uuid(),
  last_message_at: utcTimestampSchema.nullable(),
  last_message_preview: z.string().nullable(),
  created_at: utcTimestampSchema,
  unread_count: z.number().int().nonnegative(),
  participant_1: profileCardSchema.optional(),
  participant_2: profileCardSchema.optional(),
});

/**
 * QR group identity is intentionally opaque. The API accepts the exact text
 * decoded by the scanner and hashes its UTF-8 bytes server-side. Clients must
 * not trim, normalize, case-fold, parse as URLs, fetch, or navigate this text.
 */
export const MAX_SHARED_GROUP_QR_CONTENT_LENGTH = 4096;
export type SharedGroupQrContentError = "empty" | "too_long" | "nul";

function sharedGroupQrContentLength(value: string) {
  return Array.from(value).length;
}

export function sharedGroupQrContentError(value: string): SharedGroupQrContentError | null {
  const length = sharedGroupQrContentLength(value);
  if (length > MAX_SHARED_GROUP_QR_CONTENT_LENGTH) return "too_long";
  if (length === 0) return "empty";
  if (value.includes("\u0000")) return "nul";
  return null;
}

export const sharedGroupJoinRequestSchema = z.strictObject({
  qr_content: z.string()
    .min(1)
    .refine(
      (value) => sharedGroupQrContentLength(value) <= MAX_SHARED_GROUP_QR_CONTENT_LENGTH,
      `QR content must be ${MAX_SHARED_GROUP_QR_CONTENT_LENGTH} characters or less`,
    )
    .refine((value) => !value.includes("\u0000"), "QR content must be text"),
});

export const sharedGroupSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.literal("Shared group"),
  member_count: z.number().int().positive(),
  last_message_at: utcTimestampSchema.nullable(),
  last_message_preview: z.string().nullable(),
  created_at: utcTimestampSchema,
  unread_count: z.number().int().nonnegative(),
});

export const sharedGroupJoinResponseSchema = z.strictObject({
  group: sharedGroupSummarySchema,
  is_new_group: z.boolean(),
  is_new_member: z.boolean(),
});


const dmInboxParticipantProfileSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema.nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
});

export const dmInboxThreadSchema = z.strictObject({
  id: z.uuid(),
  participant_1_id: z.uuid(),
  participant_2_id: z.uuid(),
  last_message_at: utcTimestampSchema.nullable(),
  last_message_preview: z.string().nullable(),
  created_at: utcTimestampSchema,
  unread_count: z.number().int().nonnegative(),
  participant_1: dmInboxParticipantProfileSchema,
  participant_2: dmInboxParticipantProfileSchema,
}).superRefine((thread, context) => {
  if (thread.participant_1_id === thread.participant_2_id) {
    context.addIssue({ code: "custom", path: ["participant_2_id"], message: "Thread participants must differ" });
  }
  if (thread.participant_1.id !== thread.participant_1_id) {
    context.addIssue({ code: "custom", path: ["participant_1", "id"], message: "Participant profile ID does not match participant_1_id" });
  }
  if (thread.participant_2.id !== thread.participant_2_id) {
    context.addIssue({ code: "custom", path: ["participant_2", "id"], message: "Participant profile ID does not match participant_2_id" });
  }
});

const dmInboxPaginationSchema = z.strictObject({
  version: z.literal(API_VERSION),
  next_cursor: cursorSchema.nullable(),
  has_more: z.boolean(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
}).superRefine((page, context) => {
  if (page.has_more !== (page.next_cursor !== null)) {
    context.addIssue({ code: "custom", path: ["next_cursor"], message: "Inbox pagination cursor does not match has_more" });
  }
});

export const dmInboxResponseSchema = z.strictObject({
  viewer_id: z.uuid(),
  threads: z.array(dmInboxThreadSchema).max(MAX_PAGE_SIZE),
  total_unread: z.number().int().nonnegative(),
  pagination: dmInboxPaginationSchema,
}).superRefine((response, context) => {
  const threadIds = new Set<string>();
  const peerIds = new Set<string>();
  let unread = 0;

  response.threads.forEach((thread, index) => {
    if (threadIds.has(thread.id)) {
      context.addIssue({ code: "custom", path: ["threads", index, "id"], message: "Duplicate thread ID" });
    }
    threadIds.add(thread.id);

    const viewerIsFirst = thread.participant_1_id === response.viewer_id;
    const viewerIsSecond = thread.participant_2_id === response.viewer_id;
    if (!viewerIsFirst && !viewerIsSecond) {
      context.addIssue({ code: "custom", path: ["threads", index], message: "Viewer is not a thread participant" });
    } else {
      const peerId = viewerIsFirst ? thread.participant_2_id : thread.participant_1_id;
      if (peerIds.has(peerId)) {
        context.addIssue({ code: "custom", path: ["threads", index], message: "Duplicate peer ID" });
      }
      peerIds.add(peerId);
    }
    unread += thread.unread_count;
  });

  if (response.total_unread !== unread) {
    context.addIssue({ code: "custom", path: ["total_unread"], message: "Inbox unread total does not match the page" });
  }
  if (response.threads.length > response.pagination.limit) {
    context.addIssue({ code: "custom", path: ["threads"], message: "Inbox page exceeds its declared limit" });
  }
  if (response.pagination.has_more && response.threads.length !== response.pagination.limit) {
    context.addIssue({ code: "custom", path: ["pagination", "has_more"], message: "A partial inbox page cannot have more rows" });
  }
});

export function dmInboxResponseSchemaFor(viewerId: string) {
  return dmInboxResponseSchema.superRefine((response, context) => {
    if (response.viewer_id !== viewerId) {
      context.addIssue({ code: "custom", path: ["viewer_id"], message: "Inbox viewer does not match authenticated viewer" });
    }
  });
}

export const dmThreadCreateRequestSchema = z.strictObject({
  user_id: z.uuid(),
});

const dmThreadCreateProfileSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema.nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
});

export const dmThreadCreateThreadSchema = z.strictObject({
  id: z.uuid(),
  participant_1_id: z.uuid(),
  participant_2_id: z.uuid(),
  last_message_at: utcTimestampSchema.nullable(),
  last_message_preview: z.string().nullable(),
  created_at: utcTimestampSchema,
  unread_count: z.number().int().nonnegative(),
  participant_1: dmThreadCreateProfileSchema,
  participant_2: dmThreadCreateProfileSchema,
}).superRefine((value, context) => {
  if (value.participant_1_id === value.participant_2_id) {
    context.addIssue({
      code: "custom",
      path: ["participant_2_id"],
      message: "Thread participants must differ",
    });
  }
  if (value.participant_1 && value.participant_1.id !== value.participant_1_id) {
    context.addIssue({
      code: "custom",
      path: ["participant_1", "id"],
      message: "Participant profile ID does not match participant_1_id",
    });
  }
  if (value.participant_2 && value.participant_2.id !== value.participant_2_id) {
    context.addIssue({
      code: "custom",
      path: ["participant_2", "id"],
      message: "Participant profile ID does not match participant_2_id",
    });
  }
});

export const dmThreadCreateResponseSchema = z.strictObject({
  id: z.uuid(),
  is_new: z.boolean(),
  balance: z.number().int().nonnegative(),
  thread: dmThreadCreateThreadSchema,
}).superRefine((value, context) => {
  if (value.id !== value.thread.id) {
    context.addIssue({
      code: "custom",
      path: ["thread", "id"],
      message: "Thread ID does not match response ID",
    });
  }
});

export function dmThreadCreateResponseSchemaFor(targetUserId: string) {
  return dmThreadCreateResponseSchema.superRefine((value, context) => {
    if (
      value.thread.participant_1_id !== targetUserId
      && value.thread.participant_2_id !== targetUserId
    ) {
      context.addIssue({
        code: "custom",
        path: ["thread"],
        message: "Thread does not contain requested target",
      });
    }
  });
}

export const messageSchema = z.object({
  id: z.uuid(),
  thread_id: z.uuid(),
  sender_id: z.uuid(),
  content: z.string().nullable(),
  message_type: z.enum(["text", "image", "system"]),
  media_url: z.string().nullable(),
  media_thumbnail_url: z.string().nullable(),
  is_read: z.boolean(),
  is_edited: z.boolean(),
  is_deleted: z.boolean(),
  created_at: utcTimestampSchema,
  sequence: z.number().int().nonnegative().optional(),
  client_id: z.uuid().nullable().optional(),
  reply_to_id: z.uuid().nullable(),
  reply_to: z.object({
    id: z.uuid(),
    sender_id: z.uuid(),
    content: z.string().nullable(),
  }).nullable(),
  sender: profileCardSchema.optional(),
});

export const messageCreateSchema = z.strictObject({
  client_id: z.uuid(),
  content: z.string().trim().min(1).max(4000),
  message_type: z.enum(["text", "image"]).default("text"),
  media_url: z.string().max(4096).optional(),
  media_thumbnail_url: z.string().max(4096).optional(),
  reply_to_id: z.uuid().optional(),
}).superRefine((value, context) => {
  if (value.message_type === "image" && !value.media_url) {
    context.addIssue({
      code: "custom",
      path: ["media_url"],
      message: "Image messages require media",
    });
  }
  if (value.message_type === "text" && (value.media_url || value.media_thumbnail_url)) {
    context.addIssue({
      code: "custom",
      path: ["media_url"],
      message: "Text messages cannot include media",
    });
  }
});

export const dmMessageEditRequestSchema = z.strictObject({
  content: z.string().trim().min(1, "Content is required").max(4000, "Content too long"),
});

export const messageHintSchema = z.object({
  thread_id: z.uuid(),
  thread_type: z.enum(["dm", "shared_group"]).optional(),
  action: z.enum(["sent", "edited", "deleted", "read", "membership"]),
  actor_id: z.uuid().nullable().optional(),
  sequence: z.number().int().positive().optional(),
});

/** Sanitized private-channel hint. Durable profile data is always re-read via the API. */
export const profileUpdatedHintSchema = z.strictObject({
  profile_id: z.uuid(),
});

export function messageHintNeedsBackfill(
  lastSequence: number | undefined,
  hintedSequence: number | undefined,
) {
  if (hintedSequence === undefined) return true;
  if (lastSequence === undefined) return true;
  return hintedSequence > lastSequence;
}

export function messageHintHasGap(
  lastSequence: number | undefined,
  hintedSequence: number | undefined,
) {
  return hintedSequence !== undefined
    && lastSequence !== undefined
    && hintedSequence > lastSequence + 1;
}

const nearbyLatitudeSchema = z.number().min(-90).max(90).refine(
  (value) => Number(value.toFixed(3)) === value,
  "Nearby latitude must be quantized to 3 decimal places",
);
const nearbyLongitudeSchema = z.number().min(-180).max(180).refine(
  (value) => Number(value.toFixed(3)) === value,
  "Nearby longitude must be quantized to 3 decimal places",
);

export const nearbyUserSchema = z.strictObject({
  userId: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema.nullable(),
  avatar_url: httpImageUrlSchema.nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
  lat: nearbyLatitudeSchema,
  lng: nearbyLongitudeSchema,
}).superRefine((user, context) => {
  if (user.avatar_url !== null && isPrivateProfilePhotoMediaUrl(user.avatar_url)) {
    context.addIssue({
      code: "custom",
      path: ["avatar_url"],
      message: "Nearby avatars cannot reference private profile-photo storage",
    });
  }
});

export const nearbyResponseSchema = z.strictObject({
  users: z.array(nearbyUserSchema).max(MAX_PAGE_SIZE),
}).superRefine((response, context) => {
  if (duplicateValue(response.users.map((user) => user.userId))) {
    context.addIssue({
      code: "custom",
      path: ["users"],
      message: "Nearby users must be unique",
    });
  }
});

export function nearbyResponseSchemaForViewer(
  viewerId: string,
  configuredStorageOrigin?: string,
) {
  return nearbyResponseSchema.superRefine((response, context) => {
    response.users.forEach((user, index) => {
      if (user.userId === viewerId) {
        context.addIssue({
          code: "custom",
          path: ["users", index, "userId"],
          message: "Nearby results cannot include the viewer",
        });
      }
      if (
        user.avatar_url !== null
        && (
          !isPublicProfilePhotoUrl(user.avatar_url, user.userId)
          || (configuredStorageOrigin !== undefined
            && !hasStorageOrigin(user.avatar_url, configuredStorageOrigin))
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["users", index, "avatar_url"],
          message: "Nearby avatar must be an owner-bound public profile photo",
        });
      }
    });
  });
}

export const locationUpdateResponseSchema = z.strictObject({
  ok: z.literal(true),
});

export const moderationReportStatusSchema = z.enum([
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
]);

export const moderationReportActionSchema = z.enum([
  "reviewing",
  "resolved",
  "dismissed",
]);

export const moderationReportSchema = z.strictObject({
  id: z.uuid(),
  category: z.string().min(1).max(64),
  details: z.string().nullable(),
  status: moderationReportStatusSchema,
  created_at: utcTimestampSchema,
  reviewed_at: utcTimestampSchema.nullable(),
  reviewed_by: z.uuid().nullable(),
  reporter: friendshipProfileCardSchema.optional(),
  reported_user: friendshipProfileCardSchema.optional(),
  reviewer: friendshipProfileCardSchema.optional(),
});

export const moderationReportMutationResponseSchema = z.strictObject({
  report: moderationReportSchema,
});

export function moderationReportMutationResponseSchemaFor(
  reportId: string,
  status: z.infer<typeof moderationReportActionSchema>,
) {
  return moderationReportMutationResponseSchema.superRefine((response, context) => {
    if (response.report.id !== reportId) {
      context.addIssue({
        code: "custom",
        path: ["report", "id"],
        message: "Moderation report response does not match the request",
      });
    }
    if (response.report.status !== status) {
      context.addIssue({
        code: "custom",
        path: ["report", "status"],
        message: "Moderation report response status does not match the request",
      });
    }
  });
}

export const moderationPhotoSchema = z.strictObject({
  id: z.uuid(),
  user_id: z.uuid(),
  storage_path: z.string().min(1),
  storage_bucket: z.string().min(1),
  thumbnail_storage_path: z.string().nullable(),
  url: httpImageUrlSchema.nullable(),
  thumbnail_url: httpImageUrlSchema.nullable(),
  is_avatar: z.boolean(),
  is_cover: z.boolean(),
  is_private: z.boolean(),
  display_order: z.number().int().nonnegative(),
  created_at: utcTimestampSchema,
  approval_status: z.enum(["pending", "approved", "rejected"]),
  reviewed_by: z.uuid().nullable(),
  reviewed_at: utcTimestampSchema.nullable(),
  rejection_reason: z.string().nullable(),
  user: profileCardSchema.optional(),
  reviewer: profileCardSchema.optional(),
}).superRefine((photo, context) => {
  if (photo.approval_status === "rejected") {
    if (photo.url !== null || photo.thumbnail_url !== null) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Rejected moderation media cannot expose object URLs",
      });
    }
    return;
  }
  if (photo.url === null) {
    context.addIssue({ code: "custom", path: ["url"], message: "Moderation media requires a URL" });
    return;
  }
  const signedBucket = signedProfilePhotoBucket(photo.url, photo.user_id);
  if (photo.approval_status === "pending") {
    if (signedBucket !== photo.storage_bucket || !PRIVATE_PROFILE_MEDIA_BUCKETS.has(photo.storage_bucket)) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Pending moderation media requires its owner-bound signed storage URL",
      });
    }
  } else if (photo.is_private) {
    if (photo.storage_bucket !== "private-profile-photos" || signedBucket !== photo.storage_bucket) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Approved private moderation media requires a signed private URL",
      });
    }
  } else if (
    !isPublicProfilePhotoUrl(photo.url, photo.user_id)
    && !isQuarantinedProfilePhotoSignedUrl(photo.url, photo.user_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "Approved public moderation media requires a public or legacy signed URL",
    });
  }
});

export const moderationPhotoMutationResponseSchema = z.strictObject({
  photo: moderationPhotoSchema,
});

export const bootstrapSchema = z.object({
  version: z.literal(API_VERSION),
  identity: z.object({ id: z.uuid(), email: z.email().nullable() }),
  onboarding_completed: z.boolean(),
  roles: z.array(z.string()),
  feature_config_version: z.string().min(1),
  unread_summary: z.object({ threads: z.number().int().nonnegative() }),
});

export const authProfileEnsureRequestSchema = z.strictObject({});

export const authProfileEnsureResponseSchema = z.strictObject({
  created: z.boolean(),
  profile: z.strictObject({
    id: z.uuid(),
    onboarding_completed: z.boolean(),
  }),
});

export const pageInfoSchema = z.strictObject({
  version: z.literal(API_VERSION),
  next_cursor: cursorSchema.nullable(),
  has_more: z.boolean(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
});

export const sharedGroupsResponseSchema = z.strictObject({
  groups: z.array(sharedGroupSummarySchema).max(MAX_PAGE_SIZE),
  total_unread: z.number().int().nonnegative(),
  pagination: pageInfoSchema,
}).superRefine((response, context) => {
  const ids = new Set<string>();
  let unread = 0;
  response.groups.forEach((group, index) => {
    if (ids.has(group.id)) {
      context.addIssue({ code: "custom", path: ["groups", index, "id"], message: "Duplicate group ID" });
    }
    ids.add(group.id);
    unread += group.unread_count;
  });
  if (response.total_unread !== unread) {
    context.addIssue({ code: "custom", path: ["total_unread"], message: "Group unread total does not match the page" });
  }
  if (response.groups.length > response.pagination.limit) {
    context.addIssue({ code: "custom", path: ["groups"], message: "Group page exceeds its declared limit" });
  }
  if (response.pagination.has_more && response.groups.length !== response.pagination.limit) {
    context.addIssue({ code: "custom", path: ["pagination", "has_more"], message: "A partial group page cannot have more rows" });
  }
});

export const sharedGroupMessageCreateSchema = z.strictObject({
  client_id: z.uuid(),
  content: z.string().trim().min(1).max(4000),
});

export const sharedGroupMessagesResponseSchema = z.strictObject({
  group: sharedGroupSummarySchema,
  messages: z.array(messageSchema).max(MAX_PAGE_SIZE),
  pagination: pageInfoSchema,
});

export const moderationReportsResponseSchema = z.strictObject({
  reports: z.array(moderationReportSchema).max(MAX_PAGE_SIZE),
  pagination: pageInfoSchema,
  legacy_pagination: z.strictObject({
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const ownerProfilePhotosResponseSchema = z.strictObject({
  photos: z.array(ownerProfilePhotoSchema).max(MAX_PAGE_SIZE),
  pagination: pageInfoSchema,
});

export const ownerProfilePhotoMutationResponseSchema = z.strictObject({
  photo: ownerProfilePhotoSchema,
});

export const ownerProfilePhotoDeleteResponseSchema = z.strictObject({
  success: z.literal(true),
});

export function ownerProfilePhotosResponseSchemaForStorageOrigin(configuredStorageOrigin: string) {
  return ownerProfilePhotosResponseSchema.superRefine((response, context) => {
    response.photos.forEach((photo, index) => {
      validatePhotoStorageOrigin(photo, configuredStorageOrigin, context, ["photos", index]);
    });
  });
}

export function ownerProfilePhotoMutationResponseSchemaForStorageOrigin(configuredStorageOrigin: string) {
  return ownerProfilePhotoMutationResponseSchema.superRefine((response, context) => {
    validatePhotoStorageOrigin(response.photo, configuredStorageOrigin, context, ["photo"]);
  });
}

export function ownerProfilePhotosResponseSchemaFor(
  ownerId: string,
  configuredStorageOrigin?: string,
) {
  return ownerProfilePhotosResponseSchema.superRefine((response, context) => {
    response.photos.forEach((photo, index) => {
      if (photo.user_id !== ownerId) {
        context.addIssue({
          code: "custom",
          path: ["photos", index, "user_id"],
          message: "Photo does not belong to authenticated owner",
        });
      }
      if (configuredStorageOrigin !== undefined) {
        validatePhotoStorageOrigin(photo, configuredStorageOrigin, context, ["photos", index]);
      }
    });
  });
}

export function ownerProfilePhotoMutationResponseSchemaFor(
  ownerId: string,
  configuredStorageOrigin?: string,
) {
  return ownerProfilePhotoMutationResponseSchema.superRefine((response, context) => {
    if (response.photo.user_id !== ownerId) {
      context.addIssue({
        code: "custom",
        path: ["photo", "user_id"],
        message: "Photo does not belong to authenticated owner",
      });
    }
    if (configuredStorageOrigin !== undefined) {
      validatePhotoStorageOrigin(response.photo, configuredStorageOrigin, context, ["photo"]);
    }
  });
}

export const publicProfileResponseSchema = z.strictObject({
  profile: publicProfileSchema,
  photos: z.array(publicProfilePhotoSchema).max(MAX_PAGE_SIZE),
  featured_media: z.strictObject({
    avatar: publicProfilePhotoSchema.nullable(),
    cover: publicProfilePhotoSchema.nullable(),
  }),
  interests: z.array(profileInterestSchema).max(50),
  stats: publicProfileStatsSchema,
  friendship: publicProfileRelationshipSchema.nullable(),
  pagination: pageInfoSchema,
}).superRefine((response, context) => {
  const avatar = response.featured_media.avatar;
  const cover = response.featured_media.cover;
  if (
    (avatar !== null && (!avatar.is_avatar || avatar.is_cover || avatar.is_private || avatar.access !== "viewable"))
    || response.profile.avatar_url !== (avatar?.url ?? null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["featured_media", "avatar"],
      message: "Avatar must match one target-owned approved avatar photo",
    });
  }
  if (
    (cover !== null && (!cover.is_cover || cover.is_avatar || cover.is_private || cover.access !== "viewable"))
    || response.profile.cover_image_url !== (cover?.url ?? null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["featured_media", "cover"],
      message: "Cover must match one target-owned approved cover photo",
    });
  }
});

export function publicProfileResponseSchemaForTarget(
  targetId: string,
  configuredStorageOrigin?: string,
) {
  return publicProfileResponseSchema.superRefine((response, context) => {
    if (response.profile.id !== targetId) {
      context.addIssue({
        code: "custom",
        path: ["profile", "id"],
        message: "Profile does not match requested user",
      });
    }
    response.photos.forEach((photo, index) => {
      if (photo.user_id !== targetId) {
        context.addIssue({
          code: "custom",
          path: ["photos", index, "user_id"],
          message: "Photo does not belong to requested user",
        });
      }
      if (configuredStorageOrigin !== undefined) {
        validatePhotoStorageOrigin(photo, configuredStorageOrigin, context, ["photos", index]);
      }
    });
    for (const [kind, photo] of Object.entries(response.featured_media)) {
      if (!photo) continue;
      if (photo.user_id !== targetId) {
        context.addIssue({
          code: "custom",
          path: ["featured_media", kind, "user_id"],
          message: "Featured media does not belong to requested user",
        });
      }
      if (configuredStorageOrigin !== undefined) {
        validatePhotoStorageOrigin(photo, configuredStorageOrigin, context, ["featured_media", kind]);
      }
    }
    response.interests.forEach((interest, index) => {
      if (interest.user_id !== targetId) {
        context.addIssue({
          code: "custom",
          path: ["interests", index, "user_id"],
          message: "Interest does not belong to requested user",
        });
      }
    });
  });
}

export function publicProfileResponseSchemaFor(
  viewerId: string,
  targetId: string,
  configuredStorageOrigin?: string,
) {
  return publicProfileResponseSchemaForTarget(targetId, configuredStorageOrigin).superRefine((response, context) => {
    const friendship = response.friendship;
    if (!friendship) return;
    const participants = new Set([friendship.requester_id, friendship.addressee_id]);
    if (
      friendship.requester_id === friendship.addressee_id
      || !participants.has(viewerId)
      || !participants.has(targetId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["friendship"],
        message: "Friendship does not match profile participants",
      });
    }
  });
}

export const messagesResponseSchema = z.object({
  thread: threadSummarySchema,
  messages: z.array(messageSchema),
  pagination: pageInfoSchema,
});

export const readReceiptResponseSchema = z.strictObject({
  success: z.literal(true),
  last_read_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export const messageMutationResponseSchema = z.strictObject({
  message: messageSchema,
});

export const chatMediaUploadResponseSchema = z.strictObject({
  url: z.string().min(1).max(4096),
  thumbnailUrl: z.string().min(1).max(4096).nullable(),
});

const SIGNED_DM_MEDIA_PATH_PREFIX = "/storage/v1/object/sign/media/";
const DM_MEDIA_OBJECT_NAME = /^(\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(_thumb)?\.(jpg|png|webp|gif)$/;

type SignedDmMediaObject = {
  directory: string;
  stem: string;
  isThumbnail: boolean;
};

function rawAbsolutePathname(value: string): string | null {
  const match = /^[A-Za-z][A-Za-z\d+.-]*:\/\/[^/?#]*(\/[^?#]*)?(?:[?#]|$)/.exec(value);
  return match ? (match[1] ?? "/") : null;
}

function signedDmMediaObject(
  value: string,
  configuredSupabaseOrigin: string,
): SignedDmMediaObject | null {
  try {
    const rawPathname = rawAbsolutePathname(value);
    const configured = new URL(configuredSupabaseOrigin);
    const candidate = new URL(value);
    if (
      !rawPathname
      || configured.protocol !== "https:"
      || candidate.protocol !== "https:"
      || candidate.origin !== configured.origin
      || candidate.username
      || candidate.password
      || candidate.hash
      // URL normalizes dot segments before exposing pathname. Signed upload
      // paths are already canonical, so compare against the raw path first.
      || rawPathname !== candidate.pathname
      || rawPathname.includes("%")
      || rawPathname.includes("\\")
      || !candidate.pathname.startsWith(SIGNED_DM_MEDIA_PATH_PREFIX)
    ) {
      return null;
    }

    const tokens = candidate.searchParams.getAll("token");
    if (tokens.length !== 1 || !tokens[0]?.trim()) return null;

    const objectPath = candidate.pathname.slice(SIGNED_DM_MEDIA_PATH_PREFIX.length);
    // Upload paths are generated from a millisecond timestamp, UUID v4, and
    // a safe image extension. Reject encoded spellings before comparing them.
    if (objectPath.includes("%")) return null;
    const segments = objectPath.split("/");
    if (segments.length !== 2 || segments.some((segment) => !segment)) return null;

    const fileName = segments[1];
    const objectMatch = DM_MEDIA_OBJECT_NAME.exec(fileName);
    if (!objectMatch) return null;
    return {
      directory: segments[0],
      stem: objectMatch[1],
      isThumbnail: objectMatch[2] === "_thumb",
    };
  } catch {
    return null;
  }
}

export function chatMediaUploadResponseSchemaFor(
  configuredSupabaseOrigin: string,
  authenticatedUploaderId: string,
) {
  return chatMediaUploadResponseSchema.superRefine((payload, context) => {
    const main = signedDmMediaObject(payload.url, configuredSupabaseOrigin);
    if (
      !authenticatedUploaderId
      || !main
      || main.isThumbnail
      || main.directory !== authenticatedUploaderId
    ) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Invalid signed media URL",
      });
    }

    if (payload.thumbnailUrl === null) return;
    const thumbnail = signedDmMediaObject(payload.thumbnailUrl, configuredSupabaseOrigin);
    if (
      !main
      || main.isThumbnail
      || !thumbnail
      || !thumbnail.isThumbnail
      || thumbnail.directory !== authenticatedUploaderId
      || thumbnail.directory !== main.directory
      || thumbnail.stem !== main.stem
    ) {
      context.addIssue({
        code: "custom",
        path: ["thumbnailUrl"],
        message: "Invalid signed media thumbnail URL",
      });
    }
  });
}

export function pageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: pageInfoSchema,
  });
}

export type ProfileCard = z.infer<typeof profileCardSchema>;
export type ProfileView = z.infer<typeof profileViewSchema>;
export type CurrentProfile = z.infer<typeof currentProfileSchema>;
export type CurrentProfileResponse = z.infer<typeof currentProfileResponseSchema>;
export type OwnerProfilePatchRequest = z.infer<typeof ownerProfilePatchRequestSchema>;
export type OwnerProfileUpdateResponse = z.infer<typeof ownerProfileUpdateResponseSchema>;
export type InterestTagDto = z.infer<typeof interestTagSchema>;
export type InterestCatalogResponse = z.infer<typeof interestCatalogResponseSchema>;
export type ProfileInterestDto = z.infer<typeof profileInterestSchema>;
export type ProfileInterestsResponse = z.infer<typeof profileInterestsResponseSchema>;
export type ProfileInterestCreateResponse = z.infer<typeof profileInterestCreateResponseSchema>;
export type ProfileInterestDeleteResponse = z.infer<typeof profileInterestDeleteResponseSchema>;
export type OwnerProfilePhoto = z.infer<typeof ownerProfilePhotoSchema>;
export type OwnerProfilePhotosResponse = z.infer<typeof ownerProfilePhotosResponseSchema>;
export type OwnerProfilePhotoMutationResponse = z.infer<typeof ownerProfilePhotoMutationResponseSchema>;
export type PublicProfilePhoto = z.infer<typeof publicProfilePhotoSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export type PublicProfileStats = z.infer<typeof publicProfileStatsSchema>;
export type PublicProfileRelationship = z.infer<typeof publicProfileRelationshipSchema>;
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;
export type OnboardingCompleteProfile = z.infer<typeof onboardingCompleteProfileSchema>;
export type OnboardingCompleteResponse = z.infer<typeof onboardingCompleteResponseSchema>;
export type Friend = z.infer<typeof friendSchema>;
export type FriendsReadResponse = z.infer<typeof friendsReadResponseSchema>;
export type FriendRequestsReadResponse = z.infer<typeof friendRequestsReadResponseSchema>;
export type FriendshipCreateResponse = z.infer<typeof friendshipCreateResponseSchema>;
export type FriendshipResponseRequest = z.infer<typeof friendshipResponseRequestSchema>;
export type FriendshipResponse = z.infer<typeof friendshipResponseSchema>;
export type FriendshipRemovalResponse = z.infer<typeof friendshipRemovalResponseSchema>;
export type BlockUserResponse = z.infer<typeof blockUserResponseSchema>;
export type CoinsResponse = z.infer<typeof coinsResponseSchema>;
export type MeetingRequest = z.infer<typeof meetingRequestSchema>;
export type MeetingResponse = z.infer<typeof meetingResponseSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type DmInboxThread = z.infer<typeof dmInboxThreadSchema>;
export type DmInboxResponse = z.infer<typeof dmInboxResponseSchema>;
export type DmThreadCreateRequest = z.infer<typeof dmThreadCreateRequestSchema>;
export type DmThreadCreateResponse = z.infer<typeof dmThreadCreateResponseSchema>;
export type SharedGroupJoinRequest = z.infer<typeof sharedGroupJoinRequestSchema>;
export type SharedGroupSummary = z.infer<typeof sharedGroupSummarySchema>;
export type SharedGroupJoinResponse = z.infer<typeof sharedGroupJoinResponseSchema>;
export type SharedGroupsResponse = z.infer<typeof sharedGroupsResponseSchema>;
export type SharedGroupMessageCreate = z.infer<typeof sharedGroupMessageCreateSchema>;
export type SharedGroupMessagesResponse = z.infer<typeof sharedGroupMessagesResponseSchema>;
export type Message = z.infer<typeof messageSchema>;
export type NearbyUserDto = z.infer<typeof nearbyUserSchema>;
export type NearbyResponseDto = z.infer<typeof nearbyResponseSchema>;
export type LocationUpdateResponse = z.infer<typeof locationUpdateResponseSchema>;
export type SearchUserDto = SearchUserResult;
export type ModerationReportStatus = z.infer<typeof moderationReportStatusSchema>;
export type ModerationReportAction = z.infer<typeof moderationReportActionSchema>;
export type ModerationReport = z.infer<typeof moderationReportSchema>;
export type ModerationReportMutationResponse = z.infer<typeof moderationReportMutationResponseSchema>;
export type ModerationReportsResponse = z.infer<typeof moderationReportsResponseSchema>;
export type ModerationPhoto = z.infer<typeof moderationPhotoSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type AuthProfileEnsureResponse = z.infer<typeof authProfileEnsureResponseSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type MessagesResponse = z.infer<typeof messagesResponseSchema>;
export type ReadReceiptResponse = z.infer<typeof readReceiptResponseSchema>;
export type MessageMutationResponse = z.infer<typeof messageMutationResponseSchema>;
export type ChatMediaUploadResponse = z.infer<typeof chatMediaUploadResponseSchema>;

export type ApiPage<T> = {
  items: T[];
  page: PageInfo;
};
