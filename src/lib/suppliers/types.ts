export interface SupplierCapabilities {
  quote: boolean;
  purchase: boolean;
  lookupOrder: boolean;
  cancel: boolean;
  tracking: boolean;
}

export type CapabilityOp = keyof SupplierCapabilities;

export interface DocumentationRef {
  url: string;
  checkedOn: string;
  outcome: string;
}

export interface SupplierInfo {
  id: string;
  name: string;
  mode: "simulated" | "live";
  /** "verified" only after official docs or a supplier agreement confirm each capability. */
  capabilityStatus: "simulated" | "verified" | "unverified";
  capabilities: SupplierCapabilities;
  documentation: DocumentationRef[];
  blockers: string[];
  shipsDirectToCustomer: boolean | null;
  canIncludeInstructions: boolean | null;
}

export interface QuoteRequestLine {
  partId: string;
  colorId: string;
  quantity: number;
  externalItemId: string | null;
  externalColorId: number | null;
}

export interface ShipTo {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface QuoteRequest {
  lines: QuoteRequestLine[];
  condition: "N" | "U";
  shipTo: ShipTo;
  ttlMinutes: number;
}

export interface QuotedLine {
  partId: string;
  colorId: string;
  quantity: number;
  available: number;
  unitCents: number;
  condition: "N" | "U";
  /** Exact part + color + condition match with enough stock. */
  matched: boolean;
}

export interface SupplierQuote {
  ref: string;
  lines: QuotedLine[];
  partsCents: number;
  pickingCents: number;
  packagingCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  expiresAt: string;
  complete: boolean;
  issues: string[];
}

export interface PurchaseRequest {
  clientReference: string;
  lines: QuoteRequestLine[];
  condition: "N" | "U";
  maxTotalCents: number;
  shipTo: ShipTo;
}

export interface PurchaseResult {
  status: "confirmed" | "partial";
  supplierOrderRef: string;
  totalCents: number;
  purchasedLines: QuoteRequestLine[];
  failedLines: QuoteRequestLine[];
}

export type LookupResult =
  | { found: false }
  | { found: true; supplierOrderRef: string; status: "confirmed" | "partial" | "canceled"; totalCents: number; purchasedLines: QuoteRequestLine[]; failedLines: QuoteRequestLine[] };

export interface TrackingInfo {
  status: "processing" | "shipped" | "delivered" | "canceled";
  carrier: string | null;
  trackingNumber: string | null;
  events: { at: string; description: string }[];
}

export interface SupplierAdapter {
  info: SupplierInfo;
  quote(req: QuoteRequest): Promise<SupplierQuote>;
  purchase(req: PurchaseRequest): Promise<PurchaseResult>;
  lookupOrder(clientReference: string): Promise<LookupResult>;
  cancel(supplierOrderRef: string): Promise<{ canceled: boolean; reason?: string }>;
  getTracking(supplierOrderRef: string): Promise<TrackingInfo>;
}

export class UnsupportedOperationError extends Error {
  constructor(
    public readonly supplier: string,
    public readonly op: CapabilityOp,
    detail: string,
  ) {
    super(`Supplier "${supplier}" does not support ${op}: ${detail}`);
  }
}

/** The outcome is unknown (e.g. timeout after sending). Must reconcile before retrying. */
export class SupplierAmbiguousError extends Error {}

/** The supplier definitively did not place the order. Safe to retry within limits. */
export class SupplierRejectedError extends Error {}
