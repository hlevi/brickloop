/** Client-safe formatting helpers (no Node imports). */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
}
