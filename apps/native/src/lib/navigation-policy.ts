export const coreNativeTabs = [
  { name: "map", route: "/(app)/map", path: "/map" },
  { name: "inbox", route: "/(app)/inbox", path: "/inbox" },
  { name: "rooms", route: "/(app)/rooms", path: "/rooms" },
  { name: "profile", route: "/(app)/profile", path: "/profile" },
] as const;

export const adminNativeTab = {
  name: "admin",
  route: "/(app)/admin",
  path: "/admin",
} as const;

export const coreNativeStackRoutes = [
  "/",
  "/(auth)/login",
  "/auth/callback",
  "/auth/reset-password",
  "/onboarding",
  "/(app)",
  "/chat/[threadId]",
  "/room/[roomId]",
  "/scan",
  "/invite/[inviterId]",
] as const;

const staticNotificationRoutes = new Set([
  "/",
  "/map",
  "/rooms",
  "/scan",
  "/inbox",
  "/profile",
  "/premium",
  "/admin",
  "/onboarding",
]);

const dynamicNotificationRoute = /^\/(?:chat|room|profile)\/[A-Za-z0-9_-]+$/;
const unsafeEncoding = /%(?:2e|2f|5c)/i;

export function resolveNotificationRoute(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://") ||
    value.includes("#") ||
    unsafeEncoding.test(value)
  ) {
    return null;
  }

  const queryIndex = value.indexOf("?");
  const path = queryIndex < 0 ? value : value.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : value.slice(queryIndex + 1);
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return null;
  if (!staticNotificationRoutes.has(path) && !dynamicNotificationRoute.test(path)) return null;
  if (!query) return path;
  if (path !== "/inbox") return null;

  const params = new URLSearchParams(query);
  if ([...params.keys()].some((key) => key !== "tab")) return null;
  const tab = params.get("tab");
  if (params.getAll("tab").length !== 1 || !tab || !["chats", "friends", "requests"].includes(tab)) {
    return null;
  }
  return `/inbox?tab=${tab}`;
}
