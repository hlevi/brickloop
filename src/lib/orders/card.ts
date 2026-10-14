import type { DesignParams } from "../model/types";
import type { ShipTo } from "../suppliers/types";
import { AppError } from "../util";

/** Inside-message typefaces offered at checkout (the print file maps them to real fonts). */
export const CARD_FONTS = ["classic", "script", "print"] as const;
export type CardFont = (typeof CARD_FONTS)[number];

export const MESSAGE_MAX = 500;
export const MESSAGE_MAX_LINES = 10;
export const SIGNATURE_MAX = 60;
/** Furthest ahead a card can be scheduled to ship. */
export const SHIP_ON_MAX_DAYS = 90;

/**
 * Everything printed on and in the card and where it goes, stored on the order (orders.card).
 * The cover and card id are copied from the frozen design; the rest comes from checkout.
 * Personal data: never logged, purged after delivery (personal_data_purged_at).
 */
export interface CardOrderDetails {
  cardId: string;
  title: string;
  headline: string;
  theme: string;
  message: string;
  signature: string;
  font: CardFont;
  /** "recipient": the studio mails it to the recipient; "me": to the purchaser's own address. */
  sendTo: "recipient" | "me";
  recipient: ShipTo | null;
  /** YYYY-MM-DD: hold the packed card and ship it on this day. Null = ship when packed. */
  shipOn: string | null;
}

const str = (v: unknown, field: string, max: number, required = true): string => {
  if (typeof v !== "string" || (required && !v.trim())) throw new AppError("invalid_card", `${field} is required`);
  return v.trim().slice(0, max);
};

export function parseAddress(v: unknown, who: string): ShipTo {
  const s = (v ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, `${who} name`, 200),
    line1: str(s.line1, "Address line 1", 200),
    line2: typeof s.line2 === "string" && s.line2.trim() ? s.line2.trim().slice(0, 200) : undefined,
    city: str(s.city, "City", 200),
    region: str(s.region, "State/region", 200),
    postalCode: str(s.postalCode, "Postal code", 200),
    country: str(s.country, "Country", 2).toUpperCase(),
  };
}

/** Keep line breaks, drop other control characters, cap length and line count. */
export function cleanMessage(v: unknown): string {
  if (typeof v !== "string") return "";
  const lines = v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.slice(0, MESSAGE_MAX_LINES).join("\n").slice(0, MESSAGE_MAX);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Validate the checkout's card section against the frozen design. `today` is injectable for tests. */
export function parseCardDetails(input: unknown, params: DesignParams, title: string, today = new Date()): CardOrderDetails {
  if (!params.card) throw new AppError("invalid_card", "This design is not a card");
  const o = (input ?? {}) as Record<string, unknown>;
  const font = (CARD_FONTS as readonly string[]).includes(o.font as string) ? (o.font as CardFont) : "classic";
  const sendTo = o.sendTo === "me" ? "me" : o.sendTo === "recipient" ? "recipient" : null;
  if (!sendTo) throw new AppError("invalid_card", "Choose who the card is sent to");
  let shipOn: string | null = null;
  if (o.shipOn !== undefined && o.shipOn !== null && o.shipOn !== "") {
    if (typeof o.shipOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.shipOn) || Number.isNaN(Date.parse(`${o.shipOn}T00:00:00Z`))) {
      throw new AppError("invalid_card", "Ship date must be a date (YYYY-MM-DD)");
    }
    const max = new Date(today.getTime() + SHIP_ON_MAX_DAYS * 86400_000);
    if (o.shipOn < isoDay(today)) throw new AppError("invalid_card", "Ship date can't be in the past");
    if (o.shipOn > isoDay(max)) throw new AppError("invalid_card", `Ship date must be within ${SHIP_ON_MAX_DAYS} days`);
    shipOn = o.shipOn === isoDay(today) ? null : o.shipOn;
  }
  return {
    cardId: params.card.cardId,
    title,
    headline: params.card.headline,
    theme: params.card.theme,
    message: cleanMessage(o.message),
    signature: typeof o.signature === "string" ? o.signature.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, SIGNATURE_MAX) : "",
    font,
    sendTo,
    recipient: sendTo === "recipient" ? parseAddress(o.recipient, "Recipient") : null,
    shipOn,
  };
}
