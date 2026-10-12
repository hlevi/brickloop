# BrickLoop

Custom brick-kit pilot. Customers pick an original kit for their builder's age (puppy 4+, race car 6+, dinosaur 7+, cottage 8+, rocket 9+, desk bonsai 12+), customize it with visual controls or chat, and see a live 3D preview, the exact parts list and step-by-step PDF instructions. Each order then goes through a complete supplier quote, customer acceptance and payment authorization, re-checked procurement, capture, tracking and delivery. Exceptions go to an owner dashboard.

> **Simulation mode.** No supplier has been verified for automated purchasing (see [docs/SUPPLIER_CAPABILITIES.md](docs/SUPPLIER_CAPABILITIES.md)). Quotes, payments, purchases and shipments are produced by deterministic simulators, and are labeled as such in the UI, notifications, PDFs and database records (`mode = 'simulated'`). Live purchasing is disabled until every item in the admin "Live readiness" checklist is satisfied.

## Quick start
```bash
npm install
cp .env.example .env.local        # optional; set ADMIN_PASSWORD (12+ chars) to use /admin
npm run dev                        # http://localhost:3000 (embedded DB + inline job worker)
```
No database server, API keys or supplier credentials are needed. Data is stored in `./.data/`.

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build && npm start` | Run the app (web + inline worker) |
| `npm test` | Unit and integration tests (in-memory Postgres via PGlite) |
| `npm run typecheck` | TypeScript check |
| `npm run demo:order` | Headless end-to-end simulated order |
| `npm run export:samples` | Sample PDFs, CSVs and BrickLink XML in `out/samples/` |
| `npm run db:migrate` | Apply migrations (PostgreSQL when `DATABASE_URL` is set) |
| `npm run worker` | Standalone worker (PostgreSQL deployments) |

## What works
- **Kits:** six original kits across age bands, modeled on popular kit categories (first-build animal, vehicle, brick-built animal, house, space, botanical display) without copying any specific set. Each is authored as a layered voxel blueprint (`src/lib/model/templates/`) and compiled by `src/lib/model/kit.ts` into real parts. The compiler bridges joints between layers, places supported parts first, repairs overhangs, and handles slopes, ridges, tiles, round parts and wheels. Bounded edits: colors per component plus per-kit options (size, chimney, stages, jaw, spines, blossoms, wing, and so on).
- **Validation:** catalog and palette checks, voxel collision detection, stud connectivity to the ground (plus wheel-pin attachments), step-order feasibility, and warnings (single-stud holds, long overhangs, insert-from-below). Physical validation is a separate registry, and it is currently empty.
- **One source of truth:** the 3D viewer, isometric step diagrams, PDF instructions (cover, parts page, one page per step with parts callouts and a FRONT cue), BOM, CSV and BrickLink wanted-list XML all derive from the same model.
- **Editing:** visual controls, chat (LLM with structured tools when `ANTHROPIC_API_KEY` is set, a rule-based mock otherwise), deterministic validation of every tool call, clarifying questions, explanations for unsupported edits, undo/reset, versioned revisions, saved designs, budget suggestions.
- **Checkout and orders:** frozen design revision and BOM, complete supplier quote (parts, picking, packaging, shipping, taxes, service fee), quote expiry, idempotent payment authorization, pre-purchase re-check, spending limits, persistent jobs, reconciliation of ambiguous purchases, partial-fill compensation, capture after confirmed procurement, tracking, cancellation and refunds.
- **Owner dashboard:** exceptions with cause, exposure, evidence and allowed actions; emergency pause; live-readiness checklist; limits; simulator fault injection; mapping verification; order audit trail; pilot metrics; supplier capability view.
- **Safety:** signed cookies, admin password with lockout, same-origin checks, HMAC-verified deduplicated webhooks, upload type and size limits with private storage, redacted logs, customer data isolation, adult-purchaser confirmation.

## What is simulated, and what is blocked
| Area | State | Blocker |
|---|---|---|
| Supplier quote, purchase, tracking | Simulated | No supplier verified (docs/SUPPLIER_CAPABILITIES.md) |
| Payments | Sandbox | Live provider adapter not implemented; needs an account and keys |
| Part/color external ids | Provisional | Verification against a supplier catalog, or a supplier agreement |
| Physical validation | None recorded | Physical test builds of representative configurations |
| Email/SMS alerts | Logged to DB and dashboard | Needs a mail/SMS provider |
| Part weights (reuse reporting) | Not available (0% coverage) | Reliable weight data source |
| Carbon comparisons | Disabled by design | Evidence-based methodology |

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
