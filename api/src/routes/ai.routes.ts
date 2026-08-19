import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireWorkspaceMember } from "../middleware/rbac.middleware";
import { rateLimit } from "../middleware/rateLimiter";
import * as aiController from "../controllers/ai.controller";

export const aiRouter = Router({ mergeParams: true });

aiRouter.use(requireAuth, requireWorkspaceMember);
aiRouter.use(rateLimit({ windowSeconds: 60, max: 10 })); // generation is comparatively expensive — protect it specifically

aiRouter.post("/daily-summary", aiController.dailySummary);
aiRouter.post("/triage", aiController.triage);
