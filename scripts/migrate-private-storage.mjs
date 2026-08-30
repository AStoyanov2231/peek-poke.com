import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

if (process.env.PRIVATE_STORAGE_MIGRATION_CONFIRM !== "1") {
  throw new Error("Set PRIVATE_STORAGE_MIGRATION_CONFIRM=1 after taking a database/storage backup");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BACKUP_BUCKET = "private-migration-backups";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

function storageObjectFromUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
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

async function blobHash(blob) {
  return createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex");
}

async function copyObject(sourceBucket, targetBucket, sourcePath, targetPath = sourcePath) {
  const { data, error } = await supabase.storage.from(sourceBucket).download(sourcePath);
  if (error || !data) throw new Error(`Could not download an object from ${sourceBucket}`);
  const { error: uploadError } = await supabase.storage.from(targetBucket).upload(targetPath, data, {
    contentType: data.type || undefined,
    upsert: false,
  });
  if (uploadError && uploadError.statusCode !== "409" && uploadError.statusCode !== 409) {
    throw new Error(`Could not upload an object to ${targetBucket}`);
  }
  if (uploadError) {
    const { data: existing, error: existingError } = await supabase.storage
      .from(targetBucket)
      .download(targetPath);
    if (existingError || !existing || await blobHash(existing) !== await blobHash(data)) {
      throw new Error(`Conflicting object already exists in ${targetBucket}`);
    }
  }
}

function canonicalStorageUrl(bucket, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function migratePrivateProfilePhotos() {
  const { data: photos, error } = await supabase
    .from("profile_photos")
    .select("id, storage_path, storage_bucket, thumbnail_storage_path, thumbnail_url, url, is_private")
    .eq("is_private", true)
    .neq("storage_bucket", "private-profile-photos");
  if (error) throw error;

  let migrated = 0;
  for (const photo of photos ?? []) {
    const sourceBucket = photo.storage_bucket || "profile-photos";
    const thumbnail = photo.thumbnail_storage_path
      ? { bucket: sourceBucket, path: photo.thumbnail_storage_path }
      : storageObjectFromUrl(photo.thumbnail_url);

    const backupObjects = [];
    const originalBackupPath = `${RUN_ID}/${sourceBucket}/${photo.storage_path}`;
    await copyObject(sourceBucket, BACKUP_BUCKET, photo.storage_path, originalBackupPath);
    backupObjects.push({
      source_bucket: sourceBucket,
      source_path: photo.storage_path,
      backup_bucket: BACKUP_BUCKET,
      backup_path: originalBackupPath,
    });
    if (thumbnail?.bucket === sourceBucket) {
      const thumbnailBackupPath = `${RUN_ID}/${sourceBucket}/${thumbnail.path}`;
      await copyObject(sourceBucket, BACKUP_BUCKET, thumbnail.path, thumbnailBackupPath);
      backupObjects.push({
        source_bucket: sourceBucket,
        source_path: thumbnail.path,
        backup_bucket: BACKUP_BUCKET,
        backup_path: thumbnailBackupPath,
      });
    }

    const { data: journal, error: journalError } = await supabase
      .from("private_storage_migration_backups")
      .insert({
        run_id: RUN_ID,
        entity_type: "profile_photo",
        entity_id: photo.id,
        original_row: photo,
        backup_objects: backupObjects,
      })
      .select("id")
      .single();
    if (journalError || !journal) throw journalError ?? new Error("Could not journal storage backup");

    await copyObject(sourceBucket, "private-profile-photos", photo.storage_path);
    if (thumbnail?.bucket === sourceBucket) {
      await copyObject(sourceBucket, "private-profile-photos", thumbnail.path);
    }

    const { error: updateError } = await supabase
      .from("profile_photos")
      .update({
        storage_bucket: "private-profile-photos",
        thumbnail_storage_path: thumbnail?.path ?? null,
        url: supabase.storage
          .from("private-profile-photos")
          .getPublicUrl(photo.storage_path).data.publicUrl,
        thumbnail_url: null,
      })
      .eq("id", photo.id);
    if (updateError) throw updateError;

    const oldPaths = [photo.storage_path];
    if (thumbnail?.bucket === sourceBucket) oldPaths.push(thumbnail.path);
    const { error: removeError } = await supabase.storage.from(sourceBucket).remove(oldPaths);
    if (removeError) throw removeError;
    const { error: completeError } = await supabase
      .from("private_storage_migration_backups")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", journal.id);
    if (completeError) throw completeError;
    migrated += 1;
  }
  return migrated;
}

async function migrateMessageUrls() {
  let offset = 0;
  let migrated = 0;
  const pageSize = 500;
  while (true) {
    const { data: messages, error } = await supabase
      .from("dm_messages")
      .select("id, media_url, media_thumbnail_url")
      .not("media_url", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!messages?.length) break;

    for (const message of messages) {
      const media = storageObjectFromUrl(message.media_url);
      const thumbnail = storageObjectFromUrl(message.media_thumbnail_url);
      if (media?.bucket !== "media") continue;

      // The media bucket is private. This public-shaped URL is only a stable,
      // non-bearer object reference; authorized API responses parse it and mint
      // a fresh short-lived signed URL. Persisting a signed URL here would put
      // an expiring bearer token in a shared message row and make a later
      // migration rerun undo the canonicalization hardening.
      const mediaUrl = canonicalStorageUrl("media", media.path);
      const thumbnailUrl = thumbnail?.bucket === "media"
        ? canonicalStorageUrl("media", thumbnail.path)
        : null;
      if (
        message.media_url === mediaUrl &&
        message.media_thumbnail_url === thumbnailUrl
      ) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("dm_messages")
        .update({
          media_url: mediaUrl,
          media_thumbnail_url: thumbnailUrl,
        })
        .eq("id", message.id);
      if (updateError) throw updateError;
      migrated += 1;
    }

    if (messages.length < pageSize) break;
    offset += pageSize;
  }
  return migrated;
}

const privatePhotos = await migratePrivateProfilePhotos();
const messageRows = await migrateMessageUrls();
process.stdout.write(
  `Private storage migration complete (run ${RUN_ID}): ${privatePhotos} profile photos, ${messageRows} message rows.\n`
);
