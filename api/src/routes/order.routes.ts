import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireWorkspaceMember, requireRole } from "../middleware/rbac.middleware";
import * as orderController from "../controllers/order.controller";

export const orderRouter = Router({ mergeParams: true });

orderRouter.use(requireAuth, requireWorkspaceMember);

orderRouter.post("/", orderController.createOrder); // any member can take an order (e.g. STAFF at a counter)
orderRouter.get("/", orderController.listOrders);
orderRouter.get("/:orderId", orderController.getOrder);
orderRouter.patch("/:orderId/status", orderController.updateStatus); // any member can update order status
orderRouter.post("/:orderId/cancel", orderController.cancelOrder);
orderRouter.patch("/:orderId/assignment", requireRole(Role.OWNER, Role.MANAGER), orderController.assignOrder);
orderRouter.post("/:orderId/checkout", orderController.createCheckoutSession);
