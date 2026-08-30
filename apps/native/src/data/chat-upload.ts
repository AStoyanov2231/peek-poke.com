import {
  chatMediaUploadResponseSchemaFor,
  type ChatMediaUploadResponse,
} from "@peekpoke/shared";
import { apiFetch } from "@/lib/api";
import { env } from "@/lib/env";

export function uploadChatMedia(
  body: FormData,
  authenticatedUploaderId: string,
  configuredSupabaseOrigin = env.supabaseUrl,
): Promise<ChatMediaUploadResponse> {
  return apiFetch("/api/upload", {
    method: "POST",
    body,
    responseSchema: chatMediaUploadResponseSchemaFor(
      configuredSupabaseOrigin,
      authenticatedUploaderId,
    ),
  });
}

export async function uploadAndSendChatMedia<T>(
  body: FormData,
  authenticatedUploaderId: string,
  send: (upload: ChatMediaUploadResponse) => Promise<T>,
  configuredSupabaseOrigin = env.supabaseUrl,
): Promise<T> {
  const upload = await uploadChatMedia(body, authenticatedUploaderId, configuredSupabaseOrigin);
  return send(upload);
}
