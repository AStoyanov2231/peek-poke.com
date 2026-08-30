const avatarPalettes = [
  { bg: "#e3d5ff", fg: "#5b31bf" },
  { bg: "#ffe3d3", fg: "#a34420" },
  { bg: "#d8f5e7", fg: "#257d58" },
  { bg: "#d9ecff", fg: "#235f9f" },
  { bg: "#f7d9ee", fg: "#9b2d72" },
  { bg: "#f6edc9", fg: "#8a681d" },
] as const;

export function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return avatarPalettes[Math.abs(hash) % avatarPalettes.length];
}

export function displayName(value: { display_name?: string | null; username?: string | null } | null | undefined) {
  return value?.display_name || value?.username || "Peek user";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name[0] || "?").toUpperCase();
}
