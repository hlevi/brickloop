import { COLORS } from "./colors";
import { PARTS } from "./parts";

export type MappingStatus = "verified" | "provisional" | "unresolved";

export interface ExternalMapping {
  partId: string;
  colorId: string;
  supplier: "bricklink";
  externalItemId: string | null;
  externalColorId: number | null;
  status: MappingStatus;
  source: string;
  verifiedAt: string | null;
}

export const PROVISIONAL_SOURCE =
  "BrickLoop reference table (maintainer knowledge). Not verified against a supplier catalog: supplier sites were unreachable from the build environment on 2026-10-12.";

/** Default mapping derived from the static catalog; the database may override with verified rows. */
export function defaultMapping(partId: string, colorId: string): ExternalMapping {
  const part = PARTS[partId];
  const color = COLORS[colorId];
  if (!part || !color) {
    return { partId, colorId, supplier: "bricklink", externalItemId: null, externalColorId: null, status: "unresolved", source: "No catalog entry", verifiedAt: null };
  }
  return {
    partId,
    colorId,
    supplier: "bricklink",
    externalItemId: part.bricklinkId,
    externalColorId: color.bricklinkColorId,
    status: "provisional",
    source: PROVISIONAL_SOURCE,
    verifiedAt: null,
  };
}

export type MappingLookup = (partId: string, colorId: string) => ExternalMapping;
export const defaultLookup: MappingLookup = defaultMapping;
