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
  // Extended palette (mosaics and card builds). BrickLink ids are provisional like the rest.
  "dark-red": { id: "dark-red", name: "Dark Red", hex: "#720E0F", bricklinkColorId: 59 },
  coral: { id: "coral", name: "Coral", hex: "#FF698F", bricklinkColorId: 220 },
  "dark-pink": { id: "dark-pink", name: "Dark Pink", hex: "#C870A0", bricklinkColorId: 47 },
  magenta: { id: "magenta", name: "Magenta", hex: "#923978", bricklinkColorId: 71 },
  lavender: { id: "lavender", name: "Lavender", hex: "#E1D5ED", bricklinkColorId: 154 },
  "medium-lavender": { id: "medium-lavender", name: "Medium Lavender", hex: "#AC78BA", bricklinkColorId: 157 },
  "dark-purple": { id: "dark-purple", name: "Dark Purple", hex: "#3F3691", bricklinkColorId: 89 },
  "dark-blue": { id: "dark-blue", name: "Dark Blue", hex: "#0A3463", bricklinkColorId: 63 },
  "medium-blue": { id: "medium-blue", name: "Medium Blue", hex: "#5A93DB", bricklinkColorId: 42 },
  "dark-azure": { id: "dark-azure", name: "Dark Azure", hex: "#078BC9", bricklinkColorId: 153 },
  "medium-azure": { id: "medium-azure", name: "Medium Azure", hex: "#36AEBF", bricklinkColorId: 156 },
  "light-aqua": { id: "light-aqua", name: "Light Aqua", hex: "#ADC3C0", bricklinkColorId: 152 },
  "sand-green": { id: "sand-green", name: "Sand Green", hex: "#A0BCAC", bricklinkColorId: 48 },
  "bright-green": { id: "bright-green", name: "Bright Green", hex: "#4B9F4A", bricklinkColorId: 36 },
  "yellowish-green": { id: "yellowish-green", name: "Yellowish Green", hex: "#DFEEA5", bricklinkColorId: 158 },
  "olive-green": { id: "olive-green", name: "Olive Green", hex: "#9B9A5A", bricklinkColorId: 155 },
  "bright-light-yellow": { id: "bright-light-yellow", name: "Bright Light Yellow", hex: "#FFF03A", bricklinkColorId: 103 },
  "bright-light-orange": { id: "bright-light-orange", name: "Bright Light Orange", hex: "#F8BB3D", bricklinkColorId: 110 },
  "dark-orange": { id: "dark-orange", name: "Dark Orange", hex: "#A95500", bricklinkColorId: 68 },
  "light-nougat": { id: "light-nougat", name: "Light Nougat", hex: "#F6D7B3", bricklinkColorId: 90 },
  "medium-nougat": { id: "medium-nougat", name: "Medium Nougat", hex: "#AA7D55", bricklinkColorId: 150 },
  "dark-tan": { id: "dark-tan", name: "Dark Tan", hex: "#958A73", bricklinkColorId: 69 },
  "dark-brown": { id: "dark-brown", name: "Dark Brown", hex: "#352100", bricklinkColorId: 120 },
  "pearl-gold": { id: "pearl-gold", name: "Pearl Gold", hex: "#AA7F2E", bricklinkColorId: 115 },
  "flat-silver": { id: "flat-silver", name: "Flat Silver", hex: "#898788", bricklinkColorId: 95 },
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
