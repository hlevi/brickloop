import type { ColorId } from "../catalog/colors";

export interface World {
  id: string;
  label: string;
  icon: string;
  /** Colors per creature zone; every value must be allowed for that zone (tested). */
  colors: { skin: ColorId; belly: ColorId; feet: ColorId; eyes: ColorId; spikes: ColorId };
  backdrop: [string, string];
}

export const WORLDS: World[] = [
  { id: "lava", label: "Lava", icon: "🌋", colors: { skin: "red", belly: "orange", feet: "black", eyes: "yellow", spikes: "orange" }, backdrop: ["#ffb199", "#ff6b4a"] },
  { id: "frost", label: "Frost", icon: "🧊", colors: { skin: "white", belly: "light-bluish-gray", feet: "light-bluish-gray", eyes: "white", spikes: "blue" }, backdrop: ["#e3f4ff", "#9fd3ff"] },
  { id: "jungle", label: "Jungle", icon: "🌴", colors: { skin: "green", belly: "lime", feet: "reddish-brown", eyes: "yellow", spikes: "orange" }, backdrop: ["#d9f7c4", "#7cc96b"] },
  { id: "deepsea", label: "Deep Sea", icon: "🐙", colors: { skin: "blue", belly: "white", feet: "dark-bluish-gray", eyes: "white", spikes: "lime" }, backdrop: ["#bfe6ff", "#3a7bd5"] },
  { id: "candy", label: "Candy", icon: "🍭", colors: { skin: "bright-pink", belly: "white", feet: "white", eyes: "white", spikes: "yellow" }, backdrop: ["#ffe0f0", "#ff9ccf"] },
  { id: "robot", label: "Robot", icon: "🤖", colors: { skin: "light-bluish-gray", belly: "yellow", feet: "black", eyes: "white", spikes: "red" }, backdrop: ["#eef1f5", "#a7b1bf"] },
];

/** Backdrop for a design's current colors (falls back to a neutral sky). */
export function backdropFor(colors: Record<string, string>): [string, string] {
  const w = WORLDS.find((w) => Object.entries(w.colors).every(([k, v]) => colors[k] === v));
  return w?.backdrop ?? ["#eaf3ff", "#c9dcf5"];
}
