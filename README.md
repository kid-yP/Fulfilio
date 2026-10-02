Fulfilio — Real-Time Order & Fulfillment Platform

Demo currently offline — see screenshots below.
Repo: https://github.com/kid-yP/Fulfilio

One-line

A multi-tenant B2B fulfillment platform focused on correctness under concurrency, idempotent payments, real-time operations, and reproducible demo/test artifacts.

**Verified result:** Zero oversell across 20 simultaneous checkouts in a custom concurrency harness using row-level locking (SELECT ... FOR UPDATE) with deterministic lock ordering.

Status

v1 feature-complete. Backend tests and CI are configured. Frontend deployed to Vercel. Render blueprint included for backend staging/prod.

Key features

Authentication & multi-tenancy — JWT access + refresh-token rotation with reuse detection; workspace-scoped RBAC (OWNER / MANAGER / STAFF), invite → accept flow.

Products & Inventory — CRUD, search/filter/pagination, Redis-cached listings, row-level locking (SELECT ... FOR UPDATE) enforcing quantity >= 0 and reserved <= quantity.

Orders — Transactional stock reservation with Idempotency-Key support (dedupe double submits); order lifecycle (PENDING → PAID → PROCESSING → FULFILLING → SHIPPED → DELIVERED); cancellation and delayed reservation expiry.

Payments — Stripe Checkout + signature-verified webhooks; idempotent event processing; inventory release on checkout expiry.

Real-time — Socket.IO workspace rooms, presence, live order updates, low-stock notifications.

Background jobs — BullMQ worker queues: invites, order confirmation, invoice generation, low-stock alerts, reservation expiry, daily summary trigger.

Small useful AI — Daily operational summary and order triage, with a deterministic fallback if no LLM key is configured.

Testing & CI — 37 integration/unit tests run against a real Postgres; GitHub Actions for CI (typecheck, migrations, tests).

Tech stack (high level)

Backend: Node.js, Express, TypeScript, Prisma, PostgreSQL

Queue / cache: Redis, BullMQ

Real-time: Socket.IO

Frontend: Next.js 14, React, TypeScript, Tailwind CSS

Payments: Stripe Checkout + Webhooks

Testing: Jest + Supertest (real Postgres)

CI / Deploy: GitHub Actions, Render (backend), Vercel (frontend)

Architecture (conceptual)

Client (Next.js)  HTTPS / WSS
     ▼
Express API (TypeScript)
  ├─ Postgres (Prisma)
  ├─ Redis (cache)
  ├─ BullMQ (worker queues) → Worker process
  └─ Stripe Webhook → idempotency guard → order lifecycle updates
Socket.IO server (realtime events)

Getting started (local dev)

Prerequisites

Node.js 20+

Docker (Postgres & Redis recommended)

Stripe CLI (optional, for webhook testing)

Quick start

git clone https://github.com/kid-yP/Fulfilio.git
cd Fulfilio

# API
cd api
cp .env.example .env
# edit .env (DATABASE_URL, REDIS_URL, JWT secrets, STRIPE keys ...)
npm install
npx prisma migrate dev --name init
npm run dev  # API runs on http://localhost:4000

# Worker (separate terminal)
cd ../worker
npm install
npm run dev

# Frontend
cd ../client
cp .env.local.example .env.local
npm install
npm run dev  # Frontend on http://localhost:3000

Environment variables (examples)

DATABASE_URL (postgres)

REDIS_URL

JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

NEXT_PUBLIC_API_URL (frontend)

ANTHROPIC_API_KEY (optional for AI summary)

Running tests (integration)

From api/:

export DATABASE_URL="postgresql://fulfilio:fulfilio@localhost:5432/fulfilio_test"
npm test

CI runs the same steps under GitHub Actions.

Demo script (2 minutes)

Seed demo data: cd api && npx prisma db seed (if seeds exist).

Login as demo owner → create a product → place an order.

Start Stripe checkout using test card 4242 4242 4242 4242 → webhook should move order PENDING → PAID.

Open another browser tab (same workspace) and watch live updates via Socket.IO.

Trigger /api/v1/workspaces/:id/ai/daily-summary to view the AI summary fallback or generated summary if key configured.

Known limitations & roadmap

Email jobs are stubs by default — configure Resend (or another provider) for production.

AI LLM path uses a deterministic fallback unless ANTHROPIC_API_KEY (or other LLM key) is provided and tested.

Horizontal scaling: add @socket.io/redis-adapter for cross-process Socket.IO events.

Worker ↔ API shared constants can be extracted to a shared package for cleaner release.

Frontend: missing invitations/member-management UI and advanced triage UI.

Deployment hints

Use Render for backend (render.yaml included) and Vercel for frontend.

Add environment variables in the hosting provider (DATABASE_URL, REDIS_URL, STRIPE keys, JWT secrets).

Use stripe listen (Stripe CLI) to forward webhooks during local dev.

Contributing / Support

If you encounter problems, open an issue in the repo with steps to reproduce, or attach test logs and a minimal repro. For deployment help, contact me via the repo or at kidusmekuria11@gmail.com.
