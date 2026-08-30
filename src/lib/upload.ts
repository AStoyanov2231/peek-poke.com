import { SupabaseClient } from "@supabase/supabase-js";
import sharp, { type Sharp } from "sharp";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_DM_MEDIA_OBJECTS,
  MAX_DM_MEDIA_STORAGE_BYTES,
  MAX_FILE_SIZE,
  MAX_IMAGE_DIMENSION,
  MAX_INPUT_IMAGE_PIXELS,
  MAX_THUMBNAIL_SIZE,
  MAX_THUMBNAIL_DIMENSION,
  MAX_UPLOAD_BODY_SIZE,
} from "@/lib/constants";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const IMAGE_MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

async function hasValidImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  switch (file.type) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    default:
      return false;
  }
}

export async function validateImageFile(file: File): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "File type not allowed";
  if (file.size === 0) return "File is empty";
  if (file.size > MAX_FILE_SIZE) return "File too large. Maximum size is 2MB.";
  if (!await hasValidImageSignature(file)) return "File content does not match its image type";
  return null;
}

export function imageExtension(file: File): string {
  return IMAGE_EXTENSIONS[file.type] ?? "jpg";
}

function configureImageOutput(pipeline: Sharp, mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: 85, progressive: true });
    case "image/png":
      return pipeline.png({ compressionLevel: 9 });
    case "image/webp":
      return pipeline.webp({ quality: 85, effort: 4 });
    case "image/gif":
      return pipeline.gif({ effort: 3 });
    default:
      return pipeline;
  }
}

export async function normalizeImageFile(
  file: File,
  options: { thumbnail?: boolean } = {}
): Promise<{ file: File } | { error: string }> {
  const thumbnail = options.thumbnail === true;
  const maxDimension = thumbnail ? MAX_THUMBNAIL_DIMENSION : MAX_IMAGE_DIMENSION;
  const maxBytes = thumbnail ? MAX_THUMBNAIL_SIZE : MAX_FILE_SIZE;

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const source = sharp(input, {
      failOn: "warning",
      limitInputPixels: MAX_INPUT_IMAGE_PIXELS,
      pages: 1,
      sequentialRead: true,
    });
    const metadata = await source.metadata();
    const actualMime = metadata.format ? IMAGE_MIME_BY_FORMAT[metadata.format] : undefined;
    if (!actualMime || actualMime !== file.type || !metadata.width || !metadata.height) {
      return { error: thumbnail ? "Invalid thumbnail image" : "Invalid image" };
    }

    const pipeline = source
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      });
    const { data } = await configureImageOutput(pipeline, actualMime).toBuffer({
      resolveWithObject: true,
    });
    if (data.byteLength > maxBytes) {
      return {
        error: thumbnail
          ? "Thumbnail could not be optimized below 512KB"
          : "Image could not be optimized below 2MB",
      };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return {
      file: new File([new Uint8Array(data)], `${baseName}.${IMAGE_EXTENSIONS[actualMime]}`, {
        type: actualMime,
        lastModified: file.lastModified,
      }),
    };
  } catch (error) {
    console.warn("image normalization rejected input:", error);
    return { error: thumbnail ? "Invalid thumbnail image" : "Invalid image" };
  }
}

export function validateUploadBodySize(request: Request): string | null {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return null;
  const length = Number(rawLength);
  if (!Number.isFinite(length) || length < 0) return "Invalid Content-Length";
  return length > MAX_UPLOAD_BODY_SIZE ? "Upload body too large" : null;
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) return null;
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseBoundedFormData(request: Request): Promise<FormData | null> {
  const body = await readBoundedBody(request, MAX_UPLOAD_BODY_SIZE);
  if (!body) return null;
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) return null;
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: Buffer.from(body),
  }).formData();
}

export async function checkDmMediaQuota(
  supabase: SupabaseClient,
  userId: string,
  incomingBytes: number,
  operationId: string,
): Promise<"ok" | "exceeded" | "busy" | "unavailable"> {
  const { data: activeWrites, error: activeWritesError } = await supabase
    .from("account_storage_write_operations")
    .select("operation_id")
    .eq("user_id", userId)
    .eq("operation_kind", "dm_upload")
    .eq("status", "active");
  if (activeWritesError || !activeWrites) {
    console.error("media quota reservation check failed:", activeWritesError);
    return "unavailable";
  }
  if (activeWrites.some((write) => write.operation_id !== operationId)) return "busy";

  const { data, error } = await supabase.storage.from("media").list(userId, {
    limit: MAX_DM_MEDIA_OBJECTS + 1,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) {
    console.error("media quota check failed:", error);
    return "unavailable";
  }

  // Server-created media is flat under the user folder. A nested directory
  // indicates legacy/direct Storage writes that cannot be fully accounted for,
  // so fail closed until it is reviewed.
  if (data.length > MAX_DM_MEDIA_OBJECTS || data.some((object) => !object.id)) {
    return "exceeded";
  }

  let usedBytes = 0;
  for (const object of data) {
    const size = Number(object.metadata?.size);
    if (!Number.isFinite(size) || size < 0) return "unavailable";
    usedBytes += size;
  }

  return usedBytes + incomingBytes <= MAX_DM_MEDIA_STORAGE_BYTES
    ? "ok"
    : "exceeded";
}

export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  options: { public?: boolean; signedUrlTtlSeconds?: number } = {}
): Promise<{ url: string } | { error: string }> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: error.message };

  if (options.public === false) {
    const { data, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, options.signedUrlTtlSeconds ?? 60 * 60);
    if (signError) {
      const { error: cleanupError } = await supabase.storage.from(bucket).remove([path]);
      if (cleanupError) console.error("upload signing cleanup failed:", cleanupError);
      return { error: signError.message };
    }
    return { url: data.signedUrl };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function validateThumbnail(file: File): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Thumbnail type not allowed";
  if (file.size === 0) return "Thumbnail is empty";
  if (file.size > MAX_THUMBNAIL_SIZE) return "Thumbnail too large";
  if (!await hasValidImageSignature(file)) return "Thumbnail content does not match its image type";
  return null;
}

export async function uploadThumbnail(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  thumbnail: File,
  logPrefix: string,
  options: { public?: boolean; signedUrlTtlSeconds?: number } = {}
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, thumbnail, { contentType: thumbnail.type, upsert: false });

  if (error) {
    console.error(`${logPrefix} thumbnail:`, error);
    return null;
  }

  if (options.public === false) {
    const { data, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, options.signedUrlTtlSeconds ?? 60 * 60);
    if (signError) {
      console.error(`${logPrefix} thumbnail signing:`, signError);
      const { error: cleanupError } = await supabase.storage.from(bucket).remove([path]);
      if (cleanupError) console.error(`${logPrefix} thumbnail signing cleanup:`, cleanupError);
      return null;
    }
    return data.signedUrl;
  }

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
