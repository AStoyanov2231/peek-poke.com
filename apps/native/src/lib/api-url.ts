export function resolveApiUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const url = /^https?:\/\//.test(path)
    ? new URL(path)
    : new URL(path.replace(/^\//, ""), base);

  if (url.origin !== base.origin) {
    throw new Error("Cross-origin API requests are not allowed");
  }

  return url.toString();
}
