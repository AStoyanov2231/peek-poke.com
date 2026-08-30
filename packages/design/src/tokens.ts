export const colors = {
  ink: {
    0: "#fcfcfd",
    1: "#f7f7fa",
    2: "#eeeeF3",
    3: "#ddddE5",
    4: "#c4c4cf",
    5: "#8d8d9b",
    6: "#686876",
    7: "#3f3f4a",
    8: "#27272f",
    9: "#18181d",
  },
  primary: {
    50: "#f5f0ff",
    100: "#e8dcff",
    200: "#d1bdff",
    400: "#9a68f5",
    500: "#7c3aed",
    600: "#6827d9",
    700: "#5220ad",
    contrast: "#ffffff",
  },
  accent: {
    400: "#ff9f7a",
    500: "#ff7a50",
    600: "#e85f3d",
  },
  success: {
    500: "#38c987",
    600: "#20a96d",
  },
  warn: {
    500: "#e8c547",
  },
  danger: {
    500: "#e5483f",
  },
  surface: "#ffffff",
  surfaceAlt: "#f7f7fa",
  background: "#fcfcfd",
  hairline: "#ddddE5",
  scrim: "rgba(24, 24, 29, 0.4)",
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const fontFamilies = {
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  semibold: "Geist-SemiBold",
  bold: "Geist-Bold",
} as const;

export const typography = {
  display: { fontFamily: fontFamilies.bold, fontSize: 34, lineHeight: 36, fontWeight: "700" },
  title1: { fontFamily: fontFamilies.bold, fontSize: 28, lineHeight: 31, fontWeight: "700" },
  title2: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 25, fontWeight: "700" },
  title3: { fontFamily: fontFamilies.semibold, fontSize: 17, lineHeight: 20, fontWeight: "600" },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyBold: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  callout: { fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  caption: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  micro: { fontFamily: fontFamilies.semibold, fontSize: 11, lineHeight: 14, fontWeight: "600" },
} as const;

export const shadows = {
  e0: {
    shadowColor: colors.ink[9],
    shadowOpacity: 0.04,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  e1: {
    shadowColor: colors.ink[9],
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  e2: {
    shadowColor: colors.ink[9],
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  e3: {
    shadowColor: colors.ink[9],
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const buttonVariants = {
  primary: {
    backgroundColor: colors.ink[9],
    color: colors.primary.contrast,
  },
  accent: {
    backgroundColor: colors.primary[500],
    color: colors.primary.contrast,
  },
  secondary: {
    backgroundColor: colors.surface,
    color: colors.ink[8],
    borderColor: colors.hairline,
  },
  ghost: {
    backgroundColor: "transparent",
    color: colors.ink[7],
  },
  danger: {
    backgroundColor: colors.danger[500],
    color: colors.primary.contrast,
  },
} as const;
