const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

const ALLOWED_MEDIA_HOST = "ttojvnwpnpuhkyjncwxn.supabase.co";

export function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === ALLOWED_MEDIA_HOST;
  } catch {
    return false;
  }
}
