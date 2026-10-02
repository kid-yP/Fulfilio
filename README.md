# Fulfilio — Real-Time Order & Fulfillment Platform

**Demo currently offline — see screenshots below.**  
Repo: :contentReference[oaicite:0]{index=0}

**One-line**  
A multi-tenant B2B fulfillment platform focused on correctness under concurrency, idempotent payments, real-time operations, and reproducible demo/test artifacts.

**Verified result:** Zero oversell across 20 simultaneous checkouts in a custom concurrency harness using row-level locking (SELECT ... FOR UPDATE) with deterministic lock ordering.

---

## Tags
`#nodejs` `#typescript` `#postgres` `#prisma` `#redis` `#bullmq` `#socketio` `#stripe` `#sre` `#realtime` `#testing`

---

## Status
v1 feature-complete. Backend tests and CI are configured. Frontend deployed to Vercel. Render blueprint included for backend staging/prod.

---

## Key features

- **Authentication & multi-tenancy** — JWT access + refresh-token rotation with reuse detection; workspace-scoped RBAC (OWNER / MANAGER / STAFF), invite → accept flow.  
- **Products & Inventory** — CRUD, search/filter/pagination, Redis-cached listings, row-level locking (SELECT ... FOR UPDATE) enforcing `quantity >= 0` and `reserved <= quantity`.  
- **Orders** — Transactional stock reservation with `Idempotency-Key` support (dedupe double submits); order lifecycle (PENDING → PAID → PROCESSING → FULFILLING → SHIPPED → DELIVERED); cancellation and delayed reservation expiry.  
- **Payments** — Stripe Checkout + signature-verified webhooks; idempotent event processing; inventory release on checkout expiry.  
- **Real-time** — Socket.IO workspace rooms, presence, live order updates, low-stock notifications.  
- **Background jobs** — BullMQ worker queues: invites, order confirmation, invoice generation, low-stock alerts, reservation expiry, daily summary trigger.  
- **Small useful AI** — Daily operational summary and order triage, with a deterministic fallback if no LLM key is configured.  
- **Testing & CI** — 37 integration/unit tests run against a real Postgres; GitHub Actions for CI (typecheck, migrations, tests).

---

## Tech stack (high level)

**Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL  
**Queue / cache:** Redis, BullMQ  
**Real-time:** Socket.IO  
**Frontend:** Next.js 14, React, TypeScript, Tailwind CSS  
**Payments:** Stripe Checkout + Webhooks  
**Testing:** Jest + Supertest (real Postgres)  
**CI / Deploy:** GitHub Actions, Render (backend), Vercel (frontend)

---

## Architecture (conceptual)

Client (Next.js)  HTTPS / WSS  
&nbsp;&nbsp;&nbsp;&nbsp;▼  
Express API (TypeScript)  
&nbsp;&nbsp;&nbsp;&nbsp;├─ Postgres (Prisma)  
&nbsp;&nbsp;&nbsp;&nbsp;├─ Redis (cache)  
&nbsp;&nbsp;&nbsp;&nbsp;├─ BullMQ (worker queues) → Worker process  
&nbsp;&nbsp;&nbsp;&nbsp;└─ Stripe Webhook → idempotency guard → order lifecycle updates  
Socket.IO server (realtime events)

---

## Getting started (local dev)

**Prerequisites**

- Node.js 20+  
- Docker (Postgres & Redis recommended)  
- Stripe CLI (optional, for webhook testing)

**Quick start**

```bash
git clone <repo-url>
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

