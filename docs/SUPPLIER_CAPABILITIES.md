# Supplier capability report

**Verification date:** 2026-10-12
**Result:** No supplier was verified for automated purchasing. Live purchasing stays disabled. All orders run through the deterministic supplier simulator, and every simulated quote, purchase, payment and shipment is labeled as simulated.

## How verification was attempted

The build environment's network policy denied connections to supplier sites (HTTP 403 from the egress proxy for `www.bricklink.com`, `static.bricklink.com`, `www.brickowl.com` and `rebrickable.com`). Official documentation could not be read directly. A general web search was possible, and its findings are recorded below as **secondary and unverified**. Following the specification, no capability was inferred from a catalog API or from secondary sources, so every real supplier's capability flags are `false` in `src/lib/suppliers/unverified.ts`.

## Requirements checked for each candidate

Exact part/color matching · quantity availability · prices · shipping · taxes · minimum orders · payment · purchase submission · confirmation · cancellation · tracking · direct-to-customer shipping of a complete list · packaging · including instructions.

## Candidates

### BrickLink (marketplace)
| Item | Status |
|---|---|
| Official docs | https://www.bricklink.com/v3/api.page and https://static.bricklink.com/alpha/default/api_wiki.html: **unreachable** from this environment (2026-10-12) |
| Secondary findings | Third-party API wrappers describe order *updates* (status, payment status) as store/seller operations and report 404s on buyer-side mutations. Listing orders in both directions appears supported. No source describes creating a purchase or checking out through the API. |
| Buyer checkout via API | **Not confirmed; must not be assumed** (spec §1) |
| Split shipments | Marketplace orders are per store. A complete parts list may need several stores, which means split deliveries or physical consolidation. |
| Part/color ids | The catalog uses BrickLink item numbers and color ids. BrickLoop's mapping table is **provisional** (maintainer reference data) until each row is verified. |
| Blocker | Written confirmation, or a supplier agreement, for quote with shipping and tax, purchase, confirmation, cancel and tracking. |

### Brick Owl (marketplace)
| Item | Status |
|---|---|
| Official docs | https://www.brickowl.com/api_docs: **unreachable** (2026-10-12) |
| Secondary findings | Forum and third-party pages mention API key permissions for "Orders View/Edit" and "Wishlist View/Edit", an `order.created` webhook, and separately gated catalog access (`catalog/bulk_lookup` returning 403 without approval). No buyer checkout endpoint was found. |
| Blocker | Same as BrickLink: confirm buyer purchase and checkout support, or reach an agreement with a single store that can fill complete lists. |

### LEGO Pick a Brick
| Item | Status |
|---|---|
| Official docs | No public ordering API found. Terms: https://www.lego.com/en-us/page/terms-and-conditions (found via search) |
| Secondary findings | A web-UI list upload (CSV/JSON, up to 400 distinct pieces, US) exists. Terms allow LEGO to cancel orders that "avoid systems" or get around order limits. |
| Browser automation | **Not implemented.** It has not been verified as permitted or reliable, and access controls must not be bypassed. |
| Fit | A single shipper of genuine new parts direct to the customer would fit the pilot well, if LEGO agreed to an integration or reseller arrangement. |

### Rebrickable
A design and catalog data resource, not a fulfillment supplier. Not used for sourcing. Community designs are not imported, because access to them is not unrestricted and permission has not been obtained.

## What a live integration needs (checklist)
1. A supplier (or agreement) that confirms in writing: complete-list quoting incl. shipping/tax/minimums; purchase submission with a client reference for idempotency; order lookup by that reference (needed to reconcile ambiguous timeouts); cancellation rules; tracking; packaging; whether printed instructions can be included (otherwise BrickLoop sends the PDF digitally, which is the current behavior).
2. An adapter implementing `SupplierAdapter` with `capabilityStatus: "verified"`, `mode: "live"`, documentation references and the verification date.
3. Credentials in server-side environment variables only.
4. Verified part/color mapping rows (admin → Limits & simulator → Verify a part/color mapping).
5. Physical test builds recorded in `src/lib/validation/physical.ts`.
6. A live payment provider adapter with a confirmed authorization window (the sandbox assumes 7 days).
7. Saved operating limits, `LIVE_PURCHASING_ENABLED=true`, a controlled real order, then `LIVE_E2E_VERIFIED_AT`.

Until every item holds, `liveReadiness()` returns not-ready and orders are created in simulation mode.
