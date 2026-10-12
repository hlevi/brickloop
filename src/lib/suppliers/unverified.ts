import { UnsupportedOperationError, type CapabilityOp, type SupplierAdapter, type SupplierInfo } from "./types";

const CHECKED = "2026-10-12";
const NONE = { quote: false, purchase: false, lookupOrder: false, cancel: false, tracking: false };

/**
 * Candidate real suppliers. Every capability is false because none has been
 * verified from official documentation or a supplier agreement. Each
 * operation fails with an explicit error naming the blocker.
 */
export const CANDIDATE_SUPPLIERS: SupplierInfo[] = [
  {
    id: "bricklink",
    name: "BrickLink (marketplace)",
    mode: "live",
    capabilityStatus: "unverified",
    capabilities: NONE,
    documentation: [
      { url: "https://www.bricklink.com/v3/api.page", checkedOn: CHECKED, outcome: "Unreachable from build environment (network policy 403)." },
      { url: "https://static.bricklink.com/alpha/default/api_wiki.html", checkedOn: CHECKED, outcome: "Unreachable from build environment (network policy 403)." },
    ],
    blockers: [
      "Store API is documented as seller/store management; buyer checkout via API is not confirmed and must not be assumed.",
      "Marketplace orders are per-store: a full parts list may need several stores, i.e. split shipments or consolidation.",
      "Needs official confirmation (or a written agreement) for: quote with shipping/tax, purchase submission, confirmation, cancellation, tracking.",
    ],
    shipsDirectToCustomer: null,
    canIncludeInstructions: null,
  },
  {
    id: "brickowl",
    name: "Brick Owl (marketplace)",
    mode: "live",
    capabilityStatus: "unverified",
    capabilities: NONE,
    documentation: [{ url: "https://www.brickowl.com/api_docs", checkedOn: CHECKED, outcome: "Unreachable from build environment (network policy 403)." }],
    blockers: [
      "Secondary sources mention order and wishlist API permissions; no buyer checkout endpoint was confirmed.",
      "Multi-store fulfillment implies split deliveries unless a single store covers the list.",
    ],
    shipsDirectToCustomer: null,
    canIncludeInstructions: null,
  },
  {
    id: "lego-pick-a-brick",
    name: "LEGO Pick a Brick",
    mode: "live",
    capabilityStatus: "unverified",
    capabilities: NONE,
    documentation: [{ url: "https://www.lego.com/en-us/page/terms-and-conditions", checkedOn: CHECKED, outcome: "Found via search; no public ordering API found." }],
    blockers: [
      "No public ordering API found. Search results describe a CSV/JSON list upload in the web UI (US), not an API.",
      "Terms allow cancelling orders that avoid systems or order limits; browser automation is not assumed permitted and is not implemented.",
      "Genuine new parts and single-shipper fulfillment would fit the pilot if LEGO agreed to an integration or reseller arrangement.",
    ],
    shipsDirectToCustomer: true,
    canIncludeInstructions: false,
  },
];

export class UnverifiedSupplier implements SupplierAdapter {
  constructor(public info: SupplierInfo) {}
  private fail(op: CapabilityOp): never {
    throw new UnsupportedOperationError(this.info.id, op, this.info.blockers[0] ?? "capability not verified");
  }
  async quote(): Promise<never> {
    this.fail("quote");
  }
  async purchase(): Promise<never> {
    this.fail("purchase");
  }
  async lookupOrder(): Promise<never> {
    this.fail("lookupOrder");
  }
  async cancel(): Promise<never> {
    this.fail("cancel");
  }
  async getTracking(): Promise<never> {
    this.fail("tracking");
  }
}
