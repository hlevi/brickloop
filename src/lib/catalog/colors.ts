/**
 * Limited pilot palette. External identifiers are reference data that has NOT
 * been verified against a supplier catalog (see docs/SUPPLIER_CAPABILITIES.md).
 * Live sourcing is blocked until the corresponding part/color mapping rows are
 * marked verified in the database.
 */
export interface ColorDef {
  id: string;
  name: string;
  hex: string;
  transparent?: boolean;
  /** BrickLink color id (provisional until verified). */
  bricklinkColorId: number;
}

export const COLORS: Record<string, ColorDef> = {
  white: { id: "white", name: "White", hex: "#F4F4F4", bricklinkColorId: 1 },
  black: { id: "black", name: "Black", hex: "#1B1B1B", bricklinkColorId: 11 },
  red: { id: "red", name: "Red", hex: "#C91A09", bricklinkColorId: 5 },
  yellow: { id: "yellow", name: "Yellow", hex: "#F2CD37", bricklinkColorId: 3 },
  blue: { id: "blue", name: "Blue", hex: "#0055BF", bricklinkColorId: 7 },
  green: { id: "green", name: "Green", hex: "#237841", bricklinkColorId: 6 },
  tan: { id: "tan", name: "Tan", hex: "#E4CD9E", bricklinkColorId: 2 },
  "reddish-brown": { id: "reddish-brown", name: "Reddish Brown", hex: "#582A12", bricklinkColorId: 88 },
  "light-bluish-gray": { id: "light-bluish-gray", name: "Light Bluish Gray", hex: "#A0A5A9", bricklinkColorId: 86 },
  "dark-bluish-gray": { id: "dark-bluish-gray", name: "Dark Bluish Gray", hex: "#6C6E68", bricklinkColorId: 85 },
  orange: { id: "orange", name: "Orange", hex: "#FE8A18", bricklinkColorId: 4 },
  lime: { id: "lime", name: "Lime", hex: "#BBE90B", bricklinkColorId: 34 },
  "dark-green": { id: "dark-green", name: "Dark Green", hex: "#184632", bricklinkColorId: 80 },
  "bright-pink": { id: "bright-pink", name: "Bright Pink", hex: "#E4ADC8", bricklinkColorId: 104 },
  "trans-clear": { id: "trans-clear", name: "Trans-Clear", hex: "#DDEEFF", transparent: true, bricklinkColorId: 12 },
  "trans-red": { id: "trans-red", name: "Trans-Red", hex: "#E0304A", transparent: true, bricklinkColorId: 17 },
  "trans-yellow": { id: "trans-yellow", name: "Trans-Yellow", hex: "#F5D23A", transparent: true, bricklinkColorId: 19 },
  "trans-green": { id: "trans-green", name: "Trans-Green", hex: "#3FB25F", transparent: true, bricklinkColorId: 20 },
  "trans-light-blue": { id: "trans-light-blue", name: "Trans-Light Blue", hex: "#AEEFEC", transparent: true, bricklinkColorId: 15 },
};

export type ColorId = keyof typeof COLORS & string;

export function isColorId(v: unknown): v is ColorId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(COLORS, v);
}

/** Resolve loose user phrasing ("grey", "light gray", "brown") to a palette color id. */
const COLOR_ALIASES: Record<string, string> = {
  grey: "light-bluish-gray",
  gray: "light-bluish-gray",
  "light gray": "light-bluish-gray",
  "light grey": "light-bluish-gray",
  "dark gray": "dark-bluish-gray",
  "dark grey": "dark-bluish-gray",
  brown: "reddish-brown",
  "reddish brown": "reddish-brown",
  clear: "trans-clear",
  transparent: "trans-clear",
  "light blue": "trans-light-blue",
  "trans light blue": "trans-light-blue",
  "trans clear": "trans-clear",
  beige: "tan",
  pink: "bright-pink",
  "dark green": "dark-green",
};

export function resolveColorName(input: string): ColorId | null {
  const s = input.trim().toLowerCase().replace(/[_]+/g, " ");
  const dashed = s.replace(/\s+/g, "-");
  if (isColorId(dashed)) return dashed;
  if (COLOR_ALIASES[s]) return COLOR_ALIASES[s] as ColorId;
  for (const c of Object.values(COLORS)) {
    if (c.name.toLowerCase() === s) return c.id as ColorId;
  }
  return null;
}
