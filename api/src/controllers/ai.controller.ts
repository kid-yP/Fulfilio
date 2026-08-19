import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as aiService from "../services/ai.service";
import { WorkspaceScopedRequest } from "../middleware/rbac.middleware";

// POST, not GET — this triggers a generation operation (potentially calling
// an external LLM), which is neither free nor guaranteed idempotent/cacheable
// the way a GET should be.
export const dailySummary = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const result = await aiService.generateDailySummary(req.params.workspaceId);
  res.status(200).json(result);
});

export const triage = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const result = await aiService.generateTriage(req.params.workspaceId);
  res.status(200).json(result);
});
