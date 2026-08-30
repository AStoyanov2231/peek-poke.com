const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

const ALLOWED_MEDIA_BUCKETS = new Set(["profile-photos", "media", "covers"]);

function configuredSupabaseHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
}

export function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/^\/storage\/v1\/object\/(public|sign)\/([^/]+)\//);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === configuredSupabaseHost() &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !!pathMatch &&
      pathMatch[1] === "public" &&
      ALLOWED_MEDIA_BUCKETS.has(pathMatch[2])
    );
  } catch {
    return false;
  }
}
