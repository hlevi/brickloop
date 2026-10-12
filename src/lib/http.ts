import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, CUSTOMER_COOKIE, customerIdFromToken, isAdminToken, newCustomerToken } from "./auth/session";
import { log } from "./redact";
import { AppError } from "./util";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

/** Anonymous customer identity (signed cookie). Optionally created on first write. */
export async function getCustomerId(create = false): Promise<string | null> {
  const jar = await cookies();
  const existing = customerIdFromToken(jar.get(CUSTOMER_COOKIE)?.value);
  if (existing || !create) return existing;
  const { token, customerId } = newCustomerToken();
  jar.set(CUSTOMER_COOKIE, token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 365 });
  return customerId;
}

export async function requireCustomerId(): Promise<string> {
  const id = await getCustomerId(false);
  if (!id) throw new AppError("not_found", "Not found", 404);
  return id;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return isAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export async function requireAdmin(): Promise<string> {
  if (!(await isAdmin())) throw new AppError("unauthorized", "Admin login required", 401);
  return "admin";
}

export async function setAdminCookie(token: string | null) {
  const jar = await cookies();
  if (token) jar.set(ADMIN_COOKIE, token, { ...COOKIE_OPTS, sameSite: "strict", maxAge: 60 * 60 * 12 });
  else jar.delete(ADMIN_COOKIE);
}

/** Wrap a route handler: AppErrors map to JSON errors; anything else is a logged 500 without internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
      log.warn(`unhandled route error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      return NextResponse.json({ error: "internal", message: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("too_large", "Request body too large", 413);
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new AppError("bad_json", "Invalid JSON body");
  }
}

/** Reject cross-site form posts for state-changing requests (defense in depth beyond SameSite cookies). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError("bad_origin", "Cross-origin request rejected", 403);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("bad_origin", "Cross-origin request rejected", 403);
  }
}

export type Ctx<P extends string = "id"> = { params: Promise<Record<P, string>> };

/* ---------------------------------------------------------------- rate limit */

interface Bucket {
  tokens: number;
  at: number;
}
const rl = globalThis as unknown as { __brickloopRateLimit?: Map<string, Bucket> };
const MAX_BUCKETS = 10_000;

/**
 * Small in-memory token bucket per key (per process). A bucket holds `limit`
 * tokens and refills continuously over `windowMs`, so a key gets at most
 * `limit` requests in a burst and about `limit` per window after that.
 * Returns false when the request should be refused.
 */
export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const buckets = (rl.__brickloopRateLimit ??= new Map());
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) {
      // Drop buckets that have refilled completely; they carry no state worth keeping.
      for (const [k, v] of buckets) if (v.tokens + ((now - v.at) * limit) / windowMs >= limit) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
    }
    b = { tokens: limit, at: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(limit, b.tokens + (Math.max(0, now - b.at) * limit) / windowMs);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/** Tests: forget every bucket. */
export function resetRateLimits() {
  rl.__brickloopRateLimit?.clear();
}

/** Best-effort client IP (first X-Forwarded-For hop, as set by the proxy in front of the app). */
export function clientIp(h: Headers): string {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip")?.trim() || "unknown";
}

/** Throw HTTP 429 when this client IP made more than `limit` requests per `windowMs` in `scope`. */
export function assertRateLimit(h: Headers, scope: string, limit: number, windowMs = 60_000) {
  assertRateLimitKey(`${scope}:${clientIp(h)}`, limit, windowMs);
}

/** Same, for any key (e.g. one anonymous session, so many kids behind one school IP don't share a bucket). */
export function assertRateLimitKey(key: string, limit: number, windowMs = 60_000) {
  if (!takeToken(key, limit, windowMs)) throw new AppError("rate_limited", "Too many tries. Please wait a minute and try again.", 429);
}
