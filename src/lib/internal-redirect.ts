const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function isSafeInternalRedirect(path: unknown): path is string {
  if (typeof path !== "string") return false;
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !path.includes("://") &&
    !ENCODED_PATH_SEPARATOR.test(path) &&
    !CONTROL_CHARACTER.test(path)
  );
}
