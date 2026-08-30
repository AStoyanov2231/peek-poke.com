import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountStorageWriteKind =
  | "dm_upload"
  | "profile_photo_upload"
  | "profile_cover_upload"
  | "profile_photo_move"
  | "profile_media_moderation";

export class AccountStorageWriteError extends Error {
  constructor(
    public readonly code: "ACCOUNT_DELETION_IN_PROGRESS" | "STORAGE_WRITE_UNAVAILABLE",
    message: string,
    public readonly status: 409 | 503,
  ) {
    super(message);
    this.name = "AccountStorageWriteError";
  }
}

async function storageWriteRpc(
  supabase: SupabaseClient,
  name: "begin_account_storage_write" | "finish_account_storage_write",
  args: Record<string, string>,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // A retry reconciles a lost response because both RPCs are idempotent for
    // the same operation ID.
    // react-doctor-disable-next-line async-await-in-loop
    const { data, error } = await supabase.rpc(name, args);
    if (!error && data?.success) return data;
    if (!error && (
      data?.error === "ACCOUNT_DELETION_IN_PROGRESS"
      || data?.error === "ACCOUNT_STORAGE_WRITE_IN_PROGRESS"
    )) {
      throw new AccountStorageWriteError(
        "ACCOUNT_DELETION_IN_PROGRESS",
        "Account deletion is in progress. Try again after signing in.",
        409,
      );
    }
    lastError = error ?? data;
  }
  throw new AccountStorageWriteError(
    "STORAGE_WRITE_UNAVAILABLE",
    "Upload temporarily unavailable",
    503,
  );
}

async function abortStorageWrite(
  supabase: SupabaseClient,
  userId: string,
  operationId: string,
) {
  try {
    await supabase.rpc("abort_account_storage_write", {
      p_user_id: userId,
      p_operation_id: operationId,
    });
  } catch {
    // The active durable fence deliberately remains fail-closed for an
    // operator retry if the abort response cannot be reconciled.
  }
}

export async function runAccountStorageWrite<T>(
  supabase: SupabaseClient,
  userId: string,
  kind: AccountStorageWriteKind,
  work: () => Promise<T>,
  onWorkFailure: () => Promise<void>,
  operationId: string = randomUUID(),
): Promise<T> {
  await storageWriteRpc(supabase, "begin_account_storage_write", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_operation_kind: kind,
  });

  let result: T;
  try {
    result = await work();
  } catch (error) {
    await onWorkFailure();
    await abortStorageWrite(supabase, userId, operationId);
    throw error;
  }

  await storageWriteRpc(supabase, "finish_account_storage_write", {
    p_user_id: userId,
    p_operation_id: operationId,
  });
  return result;
}
