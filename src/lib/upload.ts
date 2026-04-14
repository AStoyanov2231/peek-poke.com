import { SupabaseClient } from "@supabase/supabase-js";
import { ALLOWED_IMAGE_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE, MAX_THUMBNAIL_SIZE } from "@/lib/constants";

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "File type not allowed";
  if (file.size > MAX_FILE_SIZE) return "File too large. Maximum size is 2MB.";
  return null;
}

export function sanitizeExtension(filename: string): string {
  const raw = filename.split(".").pop()?.toLowerCase() || "jpg";
  return ALLOWED_EXTENSIONS.includes(raw) ? raw : "jpg";
}

export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type });

  if (error) return { error: error.message };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl };
}

export function validateThumbnail(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Thumbnail type not allowed";
  if (file.size > MAX_THUMBNAIL_SIZE) return "Thumbnail too large";
  return null;
}

export async function uploadThumbnail(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  thumbnail: File,
  logPrefix: string
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, thumbnail, { contentType: thumbnail.type });

  if (error) {
    console.error(`${logPrefix} thumbnail:`, error);
    return null;
  }

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
