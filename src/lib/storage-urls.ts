import type { SupabaseClient } from "@supabase/supabase-js";

export const PRIVATE_PROFILE_PHOTOS_BUCKET = "private-profile-photos";
export const PROFILE_MEDIA_QUARANTINE_BUCKET = "profile-media-quarantine";
export const APPROVED_PROFILE_PHOTOS_BUCKET = "approved-profile-photos";
export const LEGACY_PROFILE_PHOTOS_BUCKET = "profile-photos";
export const PRIVATE_DM_MEDIA_BUCKET = "media";
export const SIGNED_MEDIA_TTL_SECONDS = 60 * 60;

type PhotoWithStorage = {
  approval_status?: "pending" | "approved" | "rejected";
  is_private?: boolean;
  storage_bucket?: string | null;
  storage_path?: string | null;
  thumbnail_storage_path?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
};

export function storageObjectFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/
    );
    if (!match) return null;
    return {
      bucket: decodeURIComponent(match[1]),
      path: match[2].split("/").map(decodeURIComponent).join("/"),
    };
  } catch {
    return null;
  }
}

export function canonicalStorageUrl(bucket: string, path: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

export async function signedStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_MEDIA_TTL_SECONDS);
  if (error) {
    console.error(`Failed to sign ${bucket} object:`, error);
    return null;
  }
  return data.signedUrl;
}

export async function signPrivateProfilePhotos<T extends PhotoWithStorage>(
  supabase: SupabaseClient,
  photos: T[]
): Promise<T[]> {
  return Promise.all(photos.map(async (photo) => {
    if (photo.approval_status === "rejected") {
      return { ...photo, url: null, thumbnail_url: null };
    }

    const bucket = photo.storage_bucket;
    if (!bucket || bucket === APPROVED_PROFILE_PHOTOS_BUCKET) {
      return photo;
    }

    const mainUrl = photo.storage_path
      ? await signedStorageUrl(supabase, bucket, photo.storage_path)
      : null;
    const thumbnailObject = storageObjectFromUrl(photo.thumbnail_url);
    const thumbnailPath = photo.thumbnail_storage_path ?? (
      thumbnailObject?.bucket === bucket ? thumbnailObject.path : null
    );
    const thumbnailUrl = thumbnailPath
      ? await signedStorageUrl(supabase, bucket, thumbnailPath)
      : null;

    return {
      ...photo,
      url: mainUrl ?? "",
      thumbnail_url: thumbnailUrl,
    };
  }));
}

type MessageWithMedia = {
  media_url?: string | null;
  media_thumbnail_url?: string | null;
};

export async function signPrivateMessageMedia<T extends MessageWithMedia>(
  supabase: SupabaseClient,
  messages: T[]
): Promise<T[]> {
  return Promise.all(messages.map(async (message) => {
    const media = storageObjectFromUrl(message.media_url);
    const thumbnail = storageObjectFromUrl(message.media_thumbnail_url);
    if (media?.bucket !== PRIVATE_DM_MEDIA_BUCKET) return message;

    const [mediaUrl, thumbnailUrl] = await Promise.all([
      signedStorageUrl(supabase, media.bucket, media.path),
      thumbnail?.bucket === PRIVATE_DM_MEDIA_BUCKET
        ? signedStorageUrl(supabase, thumbnail.bucket, thumbnail.path)
        : Promise.resolve(null),
    ]);
    return {
      ...message,
      media_url: mediaUrl,
      media_thumbnail_url: thumbnailUrl,
    };
  }));
}
