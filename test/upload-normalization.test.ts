import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImageFile, readBoundedBody } from "@/lib/upload";

describe("image upload normalization", () => {
  it("re-encodes image bytes and strips EXIF metadata before storage", async () => {
    const source = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ff0000" },
    }).withMetadata({ exif: { IFD0: { Artist: "sensitive-device" } } }).jpeg().toBuffer();
    const input = new File([source], "photo.jpg", { type: "image/jpeg" });

    const result = await normalizeImageFile(input);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    const metadata = await sharp(Buffer.from(await result.file.arrayBuffer())).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBe(2);
    expect(metadata.height).toBe(2);
  });
});

describe("bounded request bodies", () => {
  it("rejects an actual streamed body that exceeds the cap without trusting Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(4));
        controller.close();
      },
    });
    const request = new Request("https://example.test/upload", {
      method: "POST",
      body: stream,
      // Node's Request requires duplex for a streamed body.
      duplex: "half",
    } as RequestInit);

    await expect(readBoundedBody(request, 7)).resolves.toBeNull();
  });
});
