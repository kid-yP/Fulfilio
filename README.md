# Fulfilio — Real-Time Order & Fulfillment Operations Platform

A production-style, multi-tenant B2B platform where teams (warehouses, distributors, agencies) manage products, inventory, orders, payments and collaborate in real time. Small, useful AI features (daily operational summary & order triage) are integrated on real operational data rather than bolted on.

**Live frontend:** https://fulfilio-omega.vercel.app  
**Status:** v1 feature-complete — backend tested & CI-protected, frontend deployed to Vercel, deploy blueprint for backend included.

---

## Features

- **Authentication & Multi-tenancy** — JWT access + refresh token rotation & reuse detection; workspace-scoped RBAC (OWNER / MANAGER / STAFF); invite → accept flow.
- **Products & Inventory** — CRUD, search/filter/pagination, Redis-cached listings, row-level locking (`SELECT ... FOR UPDATE`) enforcing `quantity >= 0` and `reserved <= quantity`.
- **Orders** — transactional stock reservation, `Idempotency-Key` support (dedupe double submits), lifecycle (PENDING → PAID → PROCESSING → FULFILLING → SHIPPED → DELIVERED), cancellation + delayed reservation expiry.
- **Payments** — Stripe Checkout, signature-verified webhooks, idempotent event processing, inventory release on checkout expiry.
- **Real-time** — Socket.IO rooms per workspace, presence, live order status updates, low-stock notifications.
- **AI (small, useful)** — daily fulfillment summary & order triage using operational data; falls back to deterministic template if no LLM key is configured.
- **Background jobs** — BullMQ worker with queues: invite email, order confirmation, invoice generation, low-stock alert, reservation expiry, daily summary trigger.
- **Testing** — 37 integration/unit tests (runs against a real Postgres instance).
- **CI/CD** — GitHub Actions runs typecheck, migrations and tests on every push; `render.yaml` blueprint included for fast staging provisioning.

---

## Architecture (high level)

Client (Next.js + Tailwind)
HTTPS │ WSS
▼
Express API (TypeScript)
+ Socket.IO server
│
┌───────┼────────┬────────┐
▼ ▼ ▼ ▼
Postgres Redis BullMQ Stripe Webhook
(Prisma) (cache +queues) (signature verify → idempotency guard)
│
Worker process (emails / invoices / expiry)

---

## Technology stack

- **Backend:** Node.js, Express, TypeScript, PostgreSQL, Prisma, Redis, BullMQ, Socket.IO  
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS  
- **Payments:** Stripe Checkout + Webhooks  
- **Email (recommended):** Resend (console-stubs in v1)  
- **Hosting (recommended):** Render for backend, Vercel for frontend  
- **AI (optional):** Anthropic Claude (or other LLM); fallback template supported  
- **Testing:** Jest, Supertest (real Postgres)  
- **CI/CD:** GitHub Actions

---

## Project structure

Fulfilio/
├── api/ # Express API (TypeScript)
│ ├── prisma/ # schema, migrations, seed
│ ├── src/
│ │ ├── controllers/
│ │ ├── services/
│ │ ├── middleware/
│ │ ├── realtime/ # Socket.IO server
│ │ ├── routes/
│ │ ├── config/
│ │ └── lib/ # Prisma, Redis, queues
│ └── tests/ # Jest integration tests
├── worker/ # BullMQ worker
├── client/ # Next.js frontend
├── .github/workflows/ci.yml
├── docker-compose.yml
├── render.yaml # Render Blueprint for staging/prod
├── .env.example
└── README.md

---

## Getting started (local development)

### Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL & Redis)
- Stripe CLI (optional, for webhook testing)

### Clone

 bash
git clone https://github.com/kid-yP/Fulfilio.git
cd Fulfilio

---

### Environment
cp .env.example .env

#### Edit .env (api/.env and worker/.env if present) and set at minimum:

JWT_ACCESS_SECRET=...         # long random string
JWT_REFRESH_SECRET=...        # different long random string
DATABASE_URL=postgresql://fulfilio:fulfilio@localhost:5432/fulfilio
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx   # from stripe listen
ANTHROPIC_API_KEY=               # optional (leave empty for fallback)
Run services

Start Postgres & Redis:

docker compose up -d postgres redis

Start API:

cd api
npm install
npx prisma migrate dev --name init
npm run dev          # API on http://localhost:4000

Start worker (separate terminal):

cd worker
npm install
npx prisma generate
npm run dev

Start frontend:

cd client
cp .env.local.example .env.local
npm install
npm run dev          # Frontend on http://localhost:3000

Optional: seed demo data

cd api
npx prisma db seed
## demo credentials: owner@fulfilio.dev / demo12345 (if seed exists)
Stripe & webhook testing (local)
Install Stripe CLI and forward events to your local webhook:
npm install -g @stripe/cli
stripe listen --forward-to http://localhost:4000/api/v1/payments/webhook --api-key sk_test_...
Copy the whsec_... webhook secret into api/.env and restart the API.
Create an order in the frontend, start checkout and use test card 4242 4242 4242 4242 (CVC 123). After webhook processing the order should move from PENDING → PAID.
Running tests

### Run integration/unit tests (uses a real Postgres test DB):

cd api
export DATABASE_URL="postgresql://fulfilio:fulfilio@localhost:5432/fulfilio_test"
npm test

CI runs the same steps via GitHub Actions.

## API overview (selected routes)
POST /api/v1/auth — register/login/refresh/logout
POST /api/v1/workspaces — create workspace (creator = OWNER)
POST /api/v1/workspaces/:id/invite — invite by email (OWNER/MANAGER)
POST /api/v1/invitations/:token/accept — accept invite (email must match)
GET /api/v1/workspaces/:id/products — list products (search, page, sort)
POST /api/v1/workspaces/:id/orders — create order (supports Idempotency-Key header)
POST /api/v1/workspaces/:id/orders/:oid/checkout — create Stripe Checkout session
POST /api/v1/payments/webhook — Stripe webhook (raw body; signature verified)
POST /api/v1/workspaces/:id/ai/daily-summary — AI daily summary (POST)

See the code for full route list and request/response shapes.

### Known limitations & future improvements
Email jobs are console-log stubs by default (configure Resend for staging).
AI full path tested only via fallback template; enable Anthropic/OpenAI keys for LLM responses.
Worker ↔ Socket.IO cross-process events require @socket.io/redis-adapter for horizontal scaling (recommended for staging/prod).
Queue constants are duplicated between API and worker (easy refactor: a shared package).
Frontend lacks invitations/member-management UI and advanced AI triage UI.
Swagger/OpenAPI documentation not yet added.

### Deployment (quick hints)

#### Backend (recommended) — Render
Use the included render.yaml (blueprint) to provision API, worker, Postgres and Redis automatically in Render.
Add Render deploy hook(s) to GitHub Secrets and set environment variables:
DATABASE_URL
REDIS_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
ANTHROPIC_API_KEY
RESEND_API_KEY
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

#### Frontend — Vercel
Import client/ into Vercel, set NEXT_PUBLIC_API_URL to your backend URL, and deploy.

### Demo script (2-minute demo)

Seed demo data (npx prisma db seed) and note demo credentials.
Login as demo owner → create product → create order.
Start checkout → pay with Stripe test card → webhook updates order to PAID.
Open another browser tab (same workspace) and observe live order status updates via Socket.IO.
Hit /api/v1/workspaces/:id/ai/daily-summary to view generated summary card.

### Contributing / Extending
#### Suggested improvements:

Add @socket.io/redis-adapter and test cross-process events.
Wire a real email provider (Resend) and change worker job handlers from console-stubs to real sends.
Add Swagger/OpenAPI for API docs and a client API SDK generator.
Extract shared constants into a packages/common workspace for reuse.

### Contact

If you need help deploying to Render/Vercel or wiring Resend/Stripe, open an issue or contact me via the repo.
