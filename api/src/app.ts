import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimit } from "./middleware/rateLimiter";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { workspaceRouter } from "./routes/workspace.routes";
import { invitationRouter } from "./routes/invitation.routes";
import { productRouter } from "./routes/product.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { orderRouter } from "./routes/order.routes";
import { paymentWebhookRouter } from "./routes/payment.routes";
import { aiRouter } from "./routes/ai.routes";

export function createApp() {
  const app = express();

  app.use(helmet());

  // Allow all origins for now — needed because the frontend is hosted
  // on Vercel and the backend is exposed via a temporary Cloudflare Tunnel.
  // For production, replace `origin: true` with your exact frontend URL.
  app.use(cors({ origin: true, credentials: true }));

  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  // MUST be registered before express.json(): Stripe's webhook signature
  // verification needs the exact raw request bytes. This router applies
  // express.raw() only to its own /webhook route, so every other route below
  // still gets normal JSON parsing.
  app.use("/api/v1/payments", paymentWebhookRouter);

  app.use(express.json());

  // Simple health endpoint used by Replit and other PaaS health checks
  app.get("/api", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(healthRouter);

  app.use(
    "/api/v1/auth",
    rateLimit({ windowSeconds: 60, max: 20 }), // protects register/login from brute force
    authRouter,
  );

  app.use("/api/v1/workspaces", workspaceRouter);
  app.use("/api/v1/invitations", invitationRouter);
  app.use("/api/v1/workspaces/:workspaceId/products", productRouter);
  app.use("/api/v1/workspaces/:workspaceId/inventory", inventoryRouter);
  app.use("/api/v1/workspaces/:workspaceId/orders", orderRouter);
  app.use("/api/v1/workspaces/:workspaceId/ai", aiRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { message: "Not found" } });
  });

  app.use(errorHandler);

  return app;
}