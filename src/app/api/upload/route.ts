import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { validateImageFile, validateThumbnail, sanitizeExtension, uploadFile, uploadThumbnail } from "@/lib/upload";

export const POST = withAuth(async (request, { user, supabase }) => {
  const formData = await request.formData();
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileError = validateImageFile(file);
  if (fileError) {
    return NextResponse.json({ error: fileError }, { status: 400 });
  }

  const timestamp = Date.now();
  const ext = sanitizeExtension(file.name);
  const filePath = `${user.id}/${timestamp}.${ext}`;

  const result = await uploadFile(supabase, "media", filePath, file);
  if ("error" in result) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  let thumbnailUrl: string | null = null;
  if (thumbnail instanceof File) {
    const thumbError = validateThumbnail(thumbnail);
    if (thumbError) {
      await supabase.storage.from("media").remove([filePath]);
      return NextResponse.json({ error: thumbError }, { status: 400 });
    }
    const thumbPath = `${user.id}/${timestamp}_thumb.${ext}`;
    thumbnailUrl = await uploadThumbnail(supabase, "media", thumbPath, thumbnail, "upload");
    if (!thumbnailUrl) {
      console.warn("upload: thumbnail upload failed, continuing without thumbnail");
    }
  }

  return NextResponse.json({ url: result.url, thumbnailUrl });
});
