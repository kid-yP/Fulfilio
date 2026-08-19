import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireWorkspaceMember, requireRole } from "../middleware/rbac.middleware";
import * as inventoryController from "../controllers/inventory.controller";

export const inventoryRouter = Router({ mergeParams: true });

inventoryRouter.use(requireAuth, requireWorkspaceMember);

inventoryRouter.get("/:productId", inventoryController.getInventory);
inventoryRouter.patch(
  "/:productId",
  requireRole(Role.OWNER, Role.MANAGER),
  inventoryController.adjustInventory,
);
