import crypto from "node:crypto";
import { env } from "../config";

/** HMAC-signed token: base64url(payload).signature */
export function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", env.sessionSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", env.sessionSecret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (typeof payload.exp === "number" && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const CUSTOMER_COOKIE = "bl_customer";
export const ADMIN_COOKIE = "bl_admin";

export function newCustomerToken(): { token: string; customerId: string } {
  const customerId = crypto.randomUUID();
  return { customerId, token: sign({ cid: customerId }) };
}

export function customerIdFromToken(token: string | undefined | null): string | null {
  const p = verify<{ cid?: string }>(token);
  return typeof p?.cid === "string" ? p.cid : null;
}

export function checkAdminPassword(candidate: string): boolean {
  const real = env.adminPassword;
  if (!real || real.length < 12) return false; // admin disabled until a strong password is configured
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export function newAdminToken(hours = 12): string {
  return sign({ role: "admin", exp: Date.now() + hours * 3600_000 });
}

export function isAdminToken(token: string | undefined | null): boolean {
  return verify<{ role?: string }>(token)?.role === "admin";
}
