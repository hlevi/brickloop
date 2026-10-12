/** Remove secrets and payment details before anything is logged or audited. */
const SECRET_KEYS = /pass(word)?|secret|token|authorization|api[-_]?key|card|cvc|cvv|pan|iban|account_?number|cookie/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const CARDLIKE = /\b(?:\d[ -]?){13,19}\b/g;

export function redactString(s: string): string {
  return s.replace(CARDLIKE, "[redacted-number]").replace(EMAIL, "$1***@$2");
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return "[truncated]" as T;
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

export const log = {
  info(msg: string, data?: unknown) {
    if (process.env.BRICKLOOP_QUIET === "1") return;
    console.log(`[brickloop] ${redactString(msg)}`, data === undefined ? "" : JSON.stringify(redact(data)));
  },
  warn(msg: string, data?: unknown) {
    if (process.env.BRICKLOOP_QUIET === "1") return;
    console.warn(`[brickloop] ${redactString(msg)}`, data === undefined ? "" : JSON.stringify(redact(data)));
  },
};
