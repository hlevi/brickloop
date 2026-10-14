import type { CoverTheme } from "./types";

/** Cover themes: card stock color, ink, accent and a printed pattern. Original designs. */
export const COVER_THEMES: CoverTheme[] = [
  { id: "confetti-cream", label: "Confetti", bg: "#FBF3E4", ink: "#2B2A33", accent: "#E4572E", pattern: "confetti" },
  { id: "mint-confetti", label: "Mint confetti", bg: "#DDF3EC", ink: "#1D3B35", accent: "#2FA58B", pattern: "confetti" },
  { id: "blush-hearts", label: "Blush hearts", bg: "#F9E1E4", ink: "#5A1A2B", accent: "#D7263D", pattern: "hearts" },
  { id: "midnight-stars", label: "Midnight stars", bg: "#1D2340", ink: "#F7F3E8", accent: "#F2C14E", pattern: "stars" },
  { id: "sage-leaves", label: "Sage leaves", bg: "#E3EBDD", ink: "#22382B", accent: "#5B8C5A", pattern: "leaves" },
  { id: "sky-dots", label: "Sky dots", bg: "#E1EEF7", ink: "#1E3A55", accent: "#3D8BD9", pattern: "dots" },
  { id: "lilac-dots", label: "Lilac dots", bg: "#EDE4F5", ink: "#3B2752", accent: "#8E6CC2", pattern: "dots" },
  { id: "sunny-stripes", label: "Sunny stripes", bg: "#FFF1C9", ink: "#3A2E14", accent: "#F29E1F", pattern: "stripes" },
  { id: "peach-sunburst", label: "Peach sunburst", bg: "#FFE2D1", ink: "#4A2416", accent: "#F07A4A", pattern: "sunburst" },
  { id: "holly-snow", label: "Holly", bg: "#1F4D3A", ink: "#FFF8EE", accent: "#D6403A", pattern: "snow" },
  { id: "pumpkin-night", label: "Pumpkin night", bg: "#2A1E2E", ink: "#FFE9D1", accent: "#F07F2B", pattern: "stars" },
  { id: "ivory-plain", label: "Ivory", bg: "#F8F5EF", ink: "#1F1F24", accent: "#B08D57", pattern: "plain" },
];

export function getTheme(id: string): CoverTheme {
  return COVER_THEMES.find((t) => t.id === id) ?? COVER_THEMES[0];
}

export function isThemeId(v: unknown): v is string {
  return typeof v === "string" && COVER_THEMES.some((t) => t.id === v);
}
