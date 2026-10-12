export interface AuthorizeRequest {
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  /** Simulator test method token (e.g. "sim_ok", "sim_decline"). Never a card number. */
  method: string;
}

export interface Authorization {
  ref: string;
  amountCents: number;
  expiresAt: string;
}

export interface PaymentProvider {
  id: string;
  mode: "simulated" | "live";
  /** Hours an authorization stays capturable. */
  authWindowHours: number;
  authorize(req: AuthorizeRequest): Promise<Authorization>;
  capture(ref: string, amountCents: number, idempotencyKey: string): Promise<{ capturedCents: number }>;
  void(ref: string, idempotencyKey: string): Promise<void>;
  refund(ref: string, amountCents: number, idempotencyKey: string): Promise<{ refundedCents: number }>;
}

export class PaymentDeclinedError extends Error {}
export class PaymentOperationError extends Error {}
