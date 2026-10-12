# Deployment

> Do not deploy publicly, spend money or enable live purchasing just because this repository exists. That needs real operating credentials, spending configuration and explicit authorization from the owner.

## Option A: single process with embedded PGlite (pilot / demo)
```bash
npm ci
cp .env.example .env.local     # set SESSION_SECRET, ADMIN_PASSWORD, WEBHOOK_SECRET
npm run build
npm start                      # web app + inline worker; data in ./.data
```
PGlite allows one process per data directory, so keep `INLINE_WORKER=true` and run exactly one instance. Back up `./.data/` (database and uploads).

## Option B: PostgreSQL + separate worker (recommended for production)
```bash
export DATABASE_URL=postgres://user:pass@host:5432/brickloop
npm ci && npm run build
npm run db:migrate             # applies db/migrations/*.sql
INLINE_WORKER=false npm start  # web (scale horizontally)
npm run worker                 # 1+ workers; jobs are claimed with FOR UPDATE SKIP LOCKED
```

## Production checklist
- HTTPS termination in front of Next.js. Cookies are `Secure` when `NODE_ENV=production`.
- `SESSION_SECRET` (32+ random chars), `ADMIN_PASSWORD` (12+ chars), `WEBHOOK_SECRET` set. Keep them in a secrets manager, never in the repository.
- Persistent storage for `UPLOAD_DIR`, outside any public directory.
- Run `npm test` before every deploy.
- An email/SMS transport for the `notifications` table: not implemented. Alerts are currently recorded and shown in the admin dashboard.
- Live purchasing: follow docs/SUPPLIER_CAPABILITIES.md. The admin dashboard's "Live readiness" panel must be all green.

## Operations
- **Emergency pause:** Admin → "Emergency pause purchasing". Procurement jobs wait; nothing is lost.
- **Exceptions:** Admin → Exceptions lists cause, exposure, evidence and the allowed actions. Record owner minutes so the pilot metrics stay meaningful.
- **Simulator controls:** Admin → Limits & simulator. Inject timeouts, partial fills, price drift, stock-outs, declines and capture failures.
