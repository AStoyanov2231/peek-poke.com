import {
  chatMediaUploadResponseSchemaFor,
  type ChatMediaUploadResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function uploadChatMedia(
  body: FormData,
  authenticatedUploaderId: string,
  configuredSupabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): Promise<ChatMediaUploadResponse> {
  return fetchContract(
    "/api/upload",
    chatMediaUploadResponseSchemaFor(configuredSupabaseOrigin, authenticatedUploaderId),
    {
      method: "POST",
      body,
    },
  );
}

export async function uploadAndSendChatMedia<T>(
  body: FormData,
  authenticatedUploaderId: string,
  send: (upload: ChatMediaUploadResponse) => Promise<T>,
  configuredSupabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): Promise<T> {
  const upload = await uploadChatMedia(body, authenticatedUploaderId, configuredSupabaseOrigin);
  return send(upload);
}
