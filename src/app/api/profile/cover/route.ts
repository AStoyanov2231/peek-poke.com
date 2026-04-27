import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { validateImageFile, sanitizeExtension, uploadFile } from "@/lib/upload";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (request, { user, supabase }) => {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return apiError("No file provided", 400, "UPLOAD_FAILED");
  }

  const fileError = validateImageFile(file);
  if (fileError) {
    return apiError(fileError, 400, "UPLOAD_FAILED");
  }

  const ext = sanitizeExtension(file.name);
  const filePath = `${user.id}/${Date.now()}.${ext}`;

  const result = await uploadFile(supabase, "covers", filePath, file);
  if ("error" in result) {
    console.error("profile/cover:", result.error);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ cover_image_url: result.url })
    .eq("id", user.id);

  if (error) {
    console.error("profile/cover:", error);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  return NextResponse.json({ coverImageUrl: result.url });
});
