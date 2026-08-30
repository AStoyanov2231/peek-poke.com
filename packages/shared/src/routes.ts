export const appRoutes = {
  home: "/",
  login: "/login",
  onboarding: "/onboarding",
  inbox: "/inbox",
  friends: "/friends",
  profile: "/profile",
  admin: "/admin",
  premium: "/premium",
  rooms: "/rooms",
  scan: "/scan",
  room: (roomId: string) => `/room/${roomId}`,
  chat: (threadId: string) => `/chat/${threadId}`,
  publicProfile: (userId: string) => `/profile/${userId}`,
} as const;

export const nativeDeepLinkPrefixes = [
  "/",
  "/inbox",
  "/profile",
  "/admin",
  "/chat",
  "/onboarding",
  "/premium",
  "/rooms",
  "/scan",
  "/room",
] as const;

export function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

export function isAllowedNativeRoute(route: string): boolean {
  if (!isSafeInternalPath(route)) return false;
  if (route === "/") return true;
  return nativeDeepLinkPrefixes.some(
    (prefix) => prefix !== "/" && (route === prefix || route.startsWith(`${prefix}/`) || route.startsWith(`${prefix}?`))
  );
}
