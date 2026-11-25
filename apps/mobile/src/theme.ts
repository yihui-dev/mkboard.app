// Aligned with MkBoard Desktop dark design tokens (global.css)
export const colors = {
  bg: "#111317",
  surface: "#1B1F26",
  surfaceSoft: "#242932",
  surfaceElevated: "#242932",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.14)",
  text: "#F3F4F6",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  // MkBoard signature warm yellow accent
  accent: "#FFD76B",
  accentForeground: "#171A20",
  accentSoft: "rgba(255, 215, 107, 0.16)",
  accentBorder: "rgba(239, 183, 46, 0.45)",
  emerald: "#34D399",
  emeraldSoft: "rgba(52, 211, 153, 0.14)",
  amber: "#FFD76B",
  amberSoft: "rgba(255, 215, 107, 0.16)",
  danger: "#F87171",
  dangerSoft: "rgba(248, 113, 113, 0.14)"
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999
} as const;
