import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireWorkspaceMember, requireRole } from "../middleware/rbac.middleware";
import * as productController from "../controllers/product.controller";

// mergeParams: true is required because this router is mounted at
// /api/v1/workspaces/:workspaceId/products in app.ts — without it,
// req.params.workspaceId would be undefined inside this router.
export const productRouter = Router({ mergeParams: true });

productRouter.use(requireAuth, requireWorkspaceMember);

productRouter.post("/", requireRole(Role.OWNER, Role.MANAGER), productController.createProduct);
productRouter.get("/", productController.listProducts); // any member can browse the catalog
productRouter.get("/:productId", productController.getProduct);
productRouter.patch("/:productId", requireRole(Role.OWNER, Role.MANAGER), productController.updateProduct);
productRouter.delete("/:productId", requireRole(Role.OWNER), productController.deleteProduct);
