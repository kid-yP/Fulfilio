import { Router } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Checked by the deploy platform before routing traffic — verifies the app can
// actually reach its dependencies, not just that the process is running.
healthRouter.get("/health/ready", async (_req, res) => {
  const checks = { postgres: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const healthy = checks.postgres && checks.redis;
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ready" : "not ready", checks });
});
