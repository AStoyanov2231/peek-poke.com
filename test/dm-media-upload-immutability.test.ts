import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { uploadFile, uploadThumbnail } from "@/lib/upload";

function storageClient() {
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const createSignedUrl = vi.fn(async (path: string) => ({
    data: { signedUrl: `https://project.supabase.co/storage/v1/object/sign/media/${path}?token=test` },
    error: null,
  }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const from = vi.fn(() => ({ upload, createSignedUrl, remove }));
  return {
    client: { storage: { from } } as unknown as SupabaseClient,
    upload,
  };
}

describe("DM media upload immutability", () => {
  it("explicitly disables path replacement for main and thumbnail uploads", async () => {
    const storage = storageClient();
    const main = new File([new Uint8Array([0xff, 0xd8, 0xff])], "main.jpg", {
      type: "image/jpeg",
    });
    const thumbnail = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], "thumb.webp", {
      type: "image/webp",
    });

    await expect(uploadFile(
      storage.client,
      "media",
      "actor/generated-main.jpg",
      main,
      { public: false },
    )).resolves.toHaveProperty("url");
    await expect(uploadThumbnail(
      storage.client,
      "media",
      "actor/generated-main_thumb.webp",
      thumbnail,
      "test",
      { public: false },
    )).resolves.toContain("generated-main_thumb.webp");

    expect(storage.upload).toHaveBeenNthCalledWith(
      1,
      "actor/generated-main.jpg",
      main,
      { contentType: "image/jpeg", upsert: false },
    );
    expect(storage.upload).toHaveBeenNthCalledWith(
      2,
      "actor/generated-main_thumb.webp",
      thumbnail,
      { contentType: "image/webp", upsert: false },
    );
  });
});
