/**
 * Creature Pack serial numbers ("No. BL-7K2Q9"). A serial is a short, stable
 * label derived from the order id, so reprinting the PDF prints the same number.
 * It says nothing about the buyer and makes no rarity claim.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (uppercase, no padding). */
export function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/** The 16 bytes of a UUID ("1b4e28ba-2fa1-11d2-883f-0016d3cca427"). */
export function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error("Not a UUID");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** "BL-" + the first 5 characters of the base32-encoded order id. */
export function creatureSerial(orderId: string): string {
  return `BL-${base32(uuidBytes(orderId)).slice(0, 5)}`;
}
