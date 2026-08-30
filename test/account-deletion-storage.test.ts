import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_STORAGE_OBJECT_LIMIT,
  AccountDeletionDependencyError,
  accountStorageObjects,
  eraseStorageObjects,
  parseAccountStorageObjects,
} from "@/lib/account-deletion";

describe("account deletion Storage contract", () => {
  it("accepts empty snapshots and deduplicates exact bucket/path objects", () => {
    expect(parseAccountStorageObjects([])).toEqual([]);
    expect(parseAccountStorageObjects([
      { bucket: "media", path: "11111111-1111-4111-8111-111111111111/photo.jpg" },
      { bucket: "media", path: "11111111-1111-4111-8111-111111111111/photo.jpg" },
      { bucket: "approved-profile-photos", path: "11111111-1111-4111-8111-111111111111/profile.webp" },
    ])).toEqual([
      { bucket: "media", path: "11111111-1111-4111-8111-111111111111/photo.jpg" },
      { bucket: "approved-profile-photos", path: "11111111-1111-4111-8111-111111111111/profile.webp" },
    ]);
  });

  it.each([
    ["not an array", {}],
    ["null row", [null]],
    ["missing key", [{ bucket: "media" }]],
    ["extra key", [{ bucket: "media", path: "owner/photo.jpg", extra: true }]],
    ["unknown bucket", [{ bucket: "other", path: "owner/photo.jpg" }]],
    ["empty path", [{ bucket: "media", path: "" }]],
    ["traversal", [{ bucket: "media", path: "owner/../photo.jpg" }]],
    ["encoded path", [{ bucket: "media", path: "owner/%2e%2e/photo.jpg" }]],
    ["backslash", [{ bucket: "media", path: "owner\\photo.jpg" }]],
  ])("rejects a %s snapshot instead of silently skipping it", (_label, value) => {
    expect(() => parseAccountStorageObjects(value)).toThrow(AccountDeletionDependencyError);
  });

  it("rejects an oversized RPC response before worker consumption", () => {
    const oversized = Array.from({ length: ACCOUNT_STORAGE_OBJECT_LIMIT + 1 }, (_, index) => ({
      bucket: "media",
      path: `11111111-1111-4111-8111-111111111111/file-${index}.jpg`,
    }));
    expect(() => parseAccountStorageObjects(oversized)).toThrow("Account Storage snapshot is invalid");
  });

  it("maps a missing clean-schema RPC to a fail-closed dependency error", async () => {
    const database = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "PGRST202", message: "function was not found" },
      })),
    };

    await expect(accountStorageObjects(
      database as never,
      "11111111-1111-4111-8111-111111111111",
    )).rejects.toMatchObject({
      dependency: "storage",
      message: "Failed to load account Storage objects",
    });
  });

  it("passes a validated deduplicated snapshot to the RPC caller", async () => {
    const database = {
      rpc: vi.fn(async () => ({
        data: [
          { bucket: "media", path: "11111111-1111-4111-8111-111111111111/photo.jpg" },
          { bucket: "media", path: "11111111-1111-4111-8111-111111111111/photo.jpg" },
        ],
        error: null,
      })),
    };

    await expect(accountStorageObjects(
      database as never,
      "11111111-1111-4111-8111-111111111111",
    )).resolves.toEqual([
      { bucket: "media", path: "11111111-1111-4111-8111-111111111111/photo.jpg" },
    ]);
    expect(database.rpc).toHaveBeenCalledWith("account_erasure_storage_objects", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("deletes only validated bucket batches and treats an empty snapshot as a no-op", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ remove }));
    const database = { storage: { from } };

    await expect(eraseStorageObjects(database as never, [])).resolves.toBe(0);
    await expect(eraseStorageObjects(database as never, [
      { bucket: "media", path: "owner/a.jpg" },
      { bucket: "media", path: "owner/b.jpg" },
    ])).resolves.toBe(2);
    expect(from).toHaveBeenCalledWith("media");
    expect(remove).toHaveBeenCalledWith(["owner/a.jpg", "owner/b.jpg"]);
  });
});
