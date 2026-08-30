import { describe, expect, it } from "vitest";
import {
  ownerProfilePhotoSchema,
  publicProfilePhotoSchema,
  publicProfileResponseSchemaFor,
  publicProfileResponseSchemaForTarget,
} from "@peekpoke/shared";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-07T10:00:00.000Z";
const publicUrl = `https://project.supabase.co/storage/v1/object/public/profile-photos/${TARGET_ID}/photo.jpg`;
const privateUrl = `https://project.supabase.co/storage/v1/object/sign/private-profile-photos/${TARGET_ID}/photo.jpg?token=signed-token`;
const quarantineUrl = `https://project.supabase.co/storage/v1/object/sign/profile-media-quarantine/${TARGET_ID}/photo.jpg?token=signed-token`;

const basePhoto = {
  id: PHOTO_ID,
  user_id: TARGET_ID,
  is_avatar: false,
  is_cover: false,
  is_private: false,
  display_order: 0,
  created_at: timestamp,
};

describe("profile-photo shared contracts", () => {
  it("keeps owner media usable without exposing storage or reviewer internals", () => {
    const owner = {
      ...basePhoto,
      url: publicUrl,
      thumbnail_url: null,
      approval_status: "approved" as const,
      rejection_reason: null,
    };

    expect(ownerProfilePhotoSchema.parse(owner)).toEqual(owner);
    for (const leak of [
      { storage_path: "secret" },
      { storage_bucket: "private-profile-photos" },
      { thumbnail_storage_path: "secret" },
      { reviewed_by: VIEWER_ID },
      { reviewed_at: timestamp },
    ]) {
      expect(ownerProfilePhotoSchema.safeParse({ ...owner, ...leak }).success).toBe(false);
    }
  });

  it("requires private owner and entitled-viewer media to use signed private-bucket URLs", () => {
    const privateOwner = {
      ...basePhoto,
      is_private: true,
      url: privateUrl,
      thumbnail_url: null,
      approval_status: "approved" as const,
      rejection_reason: null,
    };

    expect(ownerProfilePhotoSchema.safeParse(privateOwner).success).toBe(true);
    expect(ownerProfilePhotoSchema.safeParse({ ...privateOwner, url: publicUrl }).success).toBe(false);
    expect(publicProfilePhotoSchema.safeParse({
      ...basePhoto,
      is_private: true,
      url: privateUrl,
      thumbnail_url: null,
      approval_status: "approved",
      access: "viewable",
    }).success).toBe(true);
  });

  it("rejects cross-owner and private-bucket URLs disguised as public media", () => {
    const owner = {
      ...basePhoto,
      url: publicUrl,
      thumbnail_url: null,
      approval_status: "approved" as const,
      rejection_reason: null,
    };
    const foreignUrl = `https://project.supabase.co/storage/v1/object/public/profile-photos/${VIEWER_ID}/photo.jpg`;
    const disguisedPrivateUrl = `https://project.supabase.co/storage/v1/object/public/private-profile-photos/${TARGET_ID}/photo.jpg`;

    expect(ownerProfilePhotoSchema.safeParse({ ...owner, url: foreignUrl }).success).toBe(false);
    expect(ownerProfilePhotoSchema.safeParse({ ...owner, url: disguisedPrivateUrl }).success).toBe(false);
    expect(publicProfilePhotoSchema.safeParse({
      ...basePhoto,
      url: foreignUrl,
      thumbnail_url: null,
      approval_status: "approved",
      access: "viewable",
    }).success).toBe(false);
  });

  it("allows pending media only through quarantine and exposes no rejected object URL", () => {
    const pending = {
      ...basePhoto,
      url: quarantineUrl,
      thumbnail_url: null,
      approval_status: "pending" as const,
      rejection_reason: null,
    };
    const rejected = {
      ...pending,
      url: null,
      approval_status: "rejected" as const,
      rejection_reason: "Policy violation",
    };

    expect(ownerProfilePhotoSchema.safeParse(pending).success).toBe(true);
    expect(ownerProfilePhotoSchema.safeParse({ ...pending, url: publicUrl }).success).toBe(false);
    expect(ownerProfilePhotoSchema.safeParse(rejected).success).toBe(true);
    expect(ownerProfilePhotoSchema.safeParse({ ...rejected, url: publicUrl }).success).toBe(false);
    expect(ownerProfilePhotoSchema.safeParse({ ...rejected, url: quarantineUrl }).success).toBe(false);
    expect(publicProfilePhotoSchema.safeParse({
      ...basePhoto,
      url: quarantineUrl,
      thumbnail_url: null,
      approval_status: "pending",
      access: "viewable",
    }).success).toBe(false);
  });

  it("permits locked placeholders only when every media URL is absent", () => {
    const locked = {
      ...basePhoto,
      is_private: true,
      url: null,
      thumbnail_url: null,
      approval_status: "approved" as const,
      access: "locked" as const,
    };

    expect(publicProfilePhotoSchema.parse(locked)).toEqual(locked);
    expect(publicProfilePhotoSchema.safeParse({ ...locked, url: privateUrl }).success).toBe(false);
    expect(publicProfilePhotoSchema.safeParse({ ...locked, is_private: false }).success).toBe(false);
  });

  it("binds profile, media, interests, and relationship identities to the requested users", () => {
    const response = {
      profile: {
        id: TARGET_ID,
        username: "target",
        display_name: null,
        bio: null,
        avatar_url: null,
        cover_image_url: null,
        location_text: null,
        is_online: false,
        last_seen_at: timestamp,
        created_at: timestamp,
        is_premium: false,
      },
      photos: [{
        ...basePhoto,
        url: publicUrl,
        thumbnail_url: null,
        approval_status: "approved" as const,
        access: "viewable" as const,
      }],
      featured_media: { avatar: null, cover: null },
      interests: [],
      stats: { photos_count: 1, friends_count: 0 },
      friendship: null,
      pagination: { version: "v1" as const, next_cursor: null, has_more: false, limit: 100 },
    };

    expect(publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID).safeParse(response).success).toBe(true);
    expect(publicProfileResponseSchemaForTarget(TARGET_ID).safeParse({
      ...response,
      photos: [{ ...response.photos[0], user_id: VIEWER_ID }],
    }).success).toBe(false);
    expect(publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID).safeParse({
      ...response,
      friendship: {
        id: PHOTO_ID,
        requester_id: TARGET_ID,
        addressee_id: PHOTO_ID,
        status: "pending",
        requested_at: timestamp,
        responded_at: null,
      },
    }).success).toBe(false);
    expect(publicProfileResponseSchemaForTarget(TARGET_ID).safeParse({
      ...response,
      profile: {
        ...response.profile,
        avatar_url: `https://project.supabase.co/storage/v1/object/sign/private-profile-photos/${TARGET_ID}/avatar.jpg?token=leak`,
      },
    }).success).toBe(false);
    expect(publicProfileResponseSchemaForTarget(TARGET_ID, "https://project.supabase.co").safeParse({
      ...response,
      profile: { ...response.profile, avatar_url: publicUrl },
    }).success).toBe(false);
    expect(publicProfileResponseSchemaForTarget(TARGET_ID, "https://project.supabase.co").safeParse({
      ...response,
      profile: { ...response.profile, cover_image_url: publicUrl },
      featured_media: {
        avatar: null,
        cover: {
          ...response.photos[0],
          is_cover: true,
          user_id: VIEWER_ID,
        },
      },
    }).success).toBe(false);
  });
});
