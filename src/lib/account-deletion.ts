import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_DELETE_BATCH_SIZE = 100;
export const ACCOUNT_STORAGE_OBJECT_LIMIT = 5000;

const ACCOUNT_STORAGE_BUCKETS = new Set([
  "approved-profile-photos",
  "covers",
  "media",
  "private-migration-backups",
  "private-profile-photos",
  "profile-media-quarantine",
  "profile-photos",
]);
const CANONICAL_STORAGE_PATH = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;

export type StorageObject = { bucket: string; path: string };

export class AccountDeletionDependencyError extends Error {
  constructor(
    public readonly dependency: "stripe" | "storage",
    message: string
  ) {
    super(message);
    this.name = "AccountDeletionDependencyError";
  }
}

function isCanonicalStoragePath(path: string) {
  return path.length > 0 &&
    path.length <= 1024 &&
    CANONICAL_STORAGE_PATH.test(path) &&
    !path.includes("//") &&
    !path.includes("\\") &&
    !path.split("/").some((segment) => segment === "." || segment === "..");
}

export function parseAccountStorageObjects(value: unknown): StorageObject[] {
  if (!Array.isArray(value) || value.length > ACCOUNT_STORAGE_OBJECT_LIMIT) {
    throw new AccountDeletionDependencyError(
      "storage",
      "Account Storage snapshot is invalid",
    );
  }

  const unique = new Map<string, StorageObject>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AccountDeletionDependencyError("storage", "Account Storage snapshot is invalid");
    }
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      typeof record.bucket !== "string" ||
      !ACCOUNT_STORAGE_BUCKETS.has(record.bucket) ||
      typeof record.path !== "string" ||
      !isCanonicalStoragePath(record.path)
    ) {
      throw new AccountDeletionDependencyError("storage", "Account Storage snapshot is invalid");
    }
    unique.set(`${record.bucket}\0${record.path}`, {
      bucket: record.bucket,
      path: record.path,
    });
  }
  return [...unique.values()];
}

export async function accountStorageObjects(
  supabase: SupabaseClient,
  userId: string
): Promise<StorageObject[]> {
  const { data: storedObjects, error } = await supabase.rpc(
    "account_erasure_storage_objects",
    { p_user_id: userId }
  );
  if (error) {
    throw new AccountDeletionDependencyError(
      "storage",
      "Failed to load account Storage objects"
    );
  }

  return parseAccountStorageObjects(storedObjects);
}

export async function eraseAccountStorage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const objects = await accountStorageObjects(supabase, userId);
  return eraseStorageObjects(supabase, objects);
}

export async function eraseStorageObjects(
  supabase: SupabaseClient,
  objects: StorageObject[],
): Promise<number> {
  const byBucket = new Map<string, string[]>();
  for (const object of objects) {
    const paths = byBucket.get(object.bucket) ?? [];
    paths.push(object.path);
    byBucket.set(object.bucket, paths);
  }

  await Promise.all([...byBucket].flatMap(([bucket, paths]) => {
    const batches: Promise<void>[] = [];
    for (let offset = 0; offset < paths.length; offset += STORAGE_DELETE_BATCH_SIZE) {
      batches.push((async () => {
        const { error } = await supabase.storage
          .from(bucket)
          .remove(paths.slice(offset, offset + STORAGE_DELETE_BATCH_SIZE));
        if (error) {
          throw new AccountDeletionDependencyError(
            "storage",
            `Failed to erase account objects in ${bucket}`
          );
        }
      })());
    }
    return batches;
  }));

  return objects.length;
}

export async function deleteStripeCustomer(customerId: string | null): Promise<void> {
  if (!customerId) return;

  try {
    const { stripe } = await import("@/lib/stripe");
    await stripe.customers.del(customerId);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "resource_missing"
    ) {
      return;
    }
    throw new AccountDeletionDependencyError(
      "stripe",
      "Stripe customer erasure failed"
    );
  }
}
