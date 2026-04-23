const PAL = [
  { bg: 'oklch(0.88 0.08 282)', fg: 'oklch(0.35 0.15 282)' },
  { bg: 'oklch(0.90 0.07 30)',  fg: 'oklch(0.42 0.14 30)' },
  { bg: 'oklch(0.88 0.08 155)', fg: 'oklch(0.38 0.12 155)' },
  { bg: 'oklch(0.90 0.07 220)', fg: 'oklch(0.38 0.14 220)' },
  { bg: 'oklch(0.90 0.08 330)', fg: 'oklch(0.42 0.15 330)' },
  { bg: 'oklch(0.90 0.08 85)',  fg: 'oklch(0.42 0.14 85)' },
] as const;

export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return PAL[Math.abs(h) % PAL.length];
}
