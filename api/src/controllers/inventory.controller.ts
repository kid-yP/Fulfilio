import { Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as inventoryService from "../services/inventory.service";
import { WorkspaceScopedRequest } from "../middleware/rbac.middleware";

const adjustSchema = z.object({ adjustment: z.number().int() });

export const getInventory = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const inventory = await inventoryService.getInventory(req.params.workspaceId, req.params.productId);
  res.status(200).json(inventory);
});

export const adjustInventory = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = adjustSchema.parse(req.body);
  const inventory = await inventoryService.adjustInventory(
    req.params.workspaceId,
    req.params.productId,
    body.adjustment,
  );
  res.status(200).json(inventory);
});
