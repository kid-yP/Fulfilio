# Fulfilio — Real-Time Order & Fulfillment Operations Platform

A multi-tenant B2B platform where teams manage products, inventory, orders,
and payments together in real time, with a small set of integrated AI
features (daily operational summary, order triage) built on real data rather
than bolted on as a demo.

**Status: v1 feature-complete** (Phases 0–7). Not yet done: an actual
frontend, and the hardening/deploy steps that require you to run them
yourself — see "Getting this deployed" below.

## Architecture

```
                    Client (React, functional UI — not yet built)
                              │
                        HTTPS │ WSS
                              ▼
                 ┌────────────────────────┐
                 │   Express API (TS)     │──── Swagger (not yet added)
                 │   + Socket.IO server   │
                 └───────────┬────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        PostgreSQL          Redis         (same process:
        (Prisma)         cache + rate      Socket.IO rooms
                            limit           per workspace)
              │               │
              │               ▼
              │            BullMQ
              │               │
              │               ▼
              │         Worker (separate
              │          container/process)
              │        ┌──────┼───────┐
              │        ▼      ▼       ▼
              │     Email  Invoice  Low-stock
              │                     + reservation
              │                       expiry
              └── Stripe Webhook → signature verify → idempotency table
                                    → update Order/Payment → emit socket event
```

## What's built (Phase 0 → 7)

**Auth & multi-tenancy** — JWT + refresh-token rotation with reuse detection,
workspace-scoped RBAC (OWNER/MANAGER/STAFF), full invite → accept flow.

**Products & inventory** — CRUD, search/filter/pagination, Redis-cached
listings (version-based invalidation), row-locked stock adjustments enforcing
`quantity >= 0` and `reserved <= quantity`.

**Orders** — transactional stock reservation across multiple items with
deterministic lock ordering (prevents deadlocks), `Idempotency-Key` header
support (a repeated key returns the original order, not a duplicate), a
7-state order lifecycle with an explicit transition allow-list, cancellation
that releases reserved stock immediately, a delayed BullMQ job that releases
stock automatically if an order is never paid, and assignment to a workspace
member.

**Payments** — Stripe Checkout, webhook signature verification, idempotent
event handling (a replayed webhook event is a proven no-op), automatic
inventory release on `checkout.session.expired`.

**Real-time** — Socket.IO, one room per workspace, membership verified
before a socket can join a room. Events: order created/status changed/
assigned, inventory low-stock, live notifications, and basic presence
(online/offline, "viewing this order").

**AI (small, on purpose)** — daily fulfillment summary and order triage,
both built on real query data (today's order counts, low-stock products,
failed payments, average fulfillment time). Works with or without an
`ANTHROPIC_API_KEY` — falls back to a deterministic, still-genuinely-useful
template when no key is configured, so the demo never breaks.

**Background jobs** — BullMQ worker with six queues: invitation email,
order confirmation email, invoice generation, low-stock alert, reservation
expiry, daily-summary trigger. Email/invoice handlers are logging stubs
(see "Known limitations").

**Tests** — 4 suites, ~35 cases total, run against a real Postgres (no
mocked DB — only Stripe, Anthropic, and the BullMQ queue layer are mocked).
The six proof points specifically worth reading:

1. **Concurrency** — `order.test.ts`: two simultaneous requests for the last
   unit of stock; exactly one succeeds, reserved stock ends at 1, not 2.
2. **Multi-tenancy / auth isolation** — every test file: a real, authenticated
   OWNER of a *different* workspace gets the same 404 as a nonexistent ID.
3. **Payment idempotency** — `payment.test.ts`: replaying the same Stripe
   event ID is a proven no-op (order transitions exactly once).
4. **Order idempotency** — `order.test.ts`: a repeated `Idempotency-Key`
   returns the original order and reserves stock exactly once.
5. **Async processing** — order confirmation, invoices, and low-stock alerts
   are queued jobs, not inline work in the request/response cycle.
6. **Caching** — `product.service.ts`: version-based Redis cache with
   invalidation on every write, covered implicitly by the product tests
   (not independently asserted — see known limitations).

## Known limitations (documented deliberately, not accidentally)

- **No shared package between `api/` and `worker/`** — queue name constants
  are duplicated in both. Fine at this size; extract into an internal
  package if the queue list keeps growing.
- **Cross-process real-time gap** — the reservation-expiry job runs in the
  worker process and updates the database correctly, but can't push a live
  Socket.IO event to connected clients (the socket server lives in the API
  process only). A client would see the change on next fetch, not
  instantly. Bridging this needs a Redis pub/sub adapter
  (`@socket.io/redis-adapter`) — a reasonable v2 addition, deliberately not
  built now to avoid adding multi-instance infrastructure a single-instance
  demo doesn't need.
- **Email is a console-log stub** — every "email" job (invitation, receipt,
  invoice) logs to the worker's stdout instead of sending anything. Wiring
  Resend is a one-file change in `api/src/lib/mailer.ts` and the worker's
  job handlers, deliberately deferred until there's a real domain to send
  from.
- **AI tests only exercise the fallback path** — the Anthropic SDK is
  mocked in tests specifically so they never make a real network call
  regardless of local `.env` contents. The "real LLM" path is exercised
  manually, not by the automated suite.
- **No frontend yet.**
- **No Swagger/OpenAPI docs yet** — the route list below is the spec for now.

## Full route list

```
/api/v1/auth                          register, login, refresh, logout
/api/v1/workspaces                    create, list mine
/api/v1/workspaces/:id                get, members
/api/v1/workspaces/:id/invite         POST  (OWNER/MANAGER)
/api/v1/workspaces/:id/members/:uid   PATCH role, DELETE  (OWNER)
/api/v1/invitations/:token/accept     POST

/api/v1/workspaces/:id/products       POST/GET  (?search=&category=&status=&page=&limit=&sort=)
/api/v1/workspaces/:id/products/:pid  GET/PATCH/DELETE
/api/v1/workspaces/:id/inventory/:pid GET/PATCH  { adjustment: number }

/api/v1/workspaces/:id/orders                    POST (Idempotency-Key header optional) / GET (?status=&page=&limit=)
/api/v1/workspaces/:id/orders/:oid               GET
/api/v1/workspaces/:id/orders/:oid/status         PATCH { status }
/api/v1/workspaces/:id/orders/:oid/cancel         POST
/api/v1/workspaces/:id/orders/:oid/assignment     PATCH { assignedToId }  (OWNER/MANAGER)
/api/v1/workspaces/:id/orders/:oid/checkout       POST → Stripe Checkout session
/api/v1/payments/webhook                          POST (Stripe, raw body)

/api/v1/workspaces/:id/ai/daily-summary   POST
/api/v1/workspaces/:id/ai/triage          POST

/health
/health/ready
```

## Running it locally

```bash
cp .env.example .env
# edit .env — at minimum set real values for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
# Stripe/Anthropic keys can stay as placeholders — checkout/webhook calls will
# 503 without a real Stripe key, and AI falls back to the template without a
# real Anthropic key. Neither blocks the rest of the app.

docker compose up --build
```

First time only, generate the initial migration before `docker compose up`:

```bash
cd api && npm install && npx prisma migrate dev --name init
```

Seed demo data:

```bash
cd api && npx prisma db seed
```

## Running the tests

```bash
cd api
npm install
export DATABASE_URL="postgresql://fulfilio:fulfilio@localhost:5432/fulfilio_test"
npm test
```

Or against Docker's Postgres:

```bash
docker compose up -d postgres
export DATABASE_URL="postgresql://fulfilio:fulfilio@localhost:5432/fulfilio_test"
cd api && npx prisma db push --skip-generate && npm test
```

## Getting this into a real repo, PR, and staging deploy

I can't do this step myself — there's no live GitHub repo or hosting account
connected to this project, so what follows is exactly what to run yourself.

```bash
git init
git add .
git commit -m "Fulfilio v1: auth, workspaces, products, orders, payments, real-time, AI"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

For future changes, branch and PR instead of pushing to `main` directly —
`.github/workflows/ci.yml` runs lint/typecheck/tests against a real
Postgres+Redis on every PR, and deploys on merge to `main` once the hooks
below are wired up.

**To get a real staging URL:**
1. Render → New → Blueprint → point it at your repo → it reads `render.yaml`
   and provisions `fulfilio-api`, `fulfilio-worker`, Postgres, and Redis.
2. Copy the two deploy hook URLs Render gives each service into your repo's
   GitHub Settings → Secrets as `RENDER_DEPLOY_HOOK_API` and
   `RENDER_DEPLOY_HOOK_WORKER`.
3. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and (optionally)
   `ANTHROPIC_API_KEY` as env vars on the Render `fulfilio-api` service
   directly (not in `render.yaml`, since those are secrets).
4. Vercel → New Project → import the same repo → auto-deploys the frontend
   on every push to `main`, once a `client/` folder exists.

Once wired up once, every future merge to `main` deploys automatically.
