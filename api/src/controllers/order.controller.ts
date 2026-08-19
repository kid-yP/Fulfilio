import { Response } from "express";
import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import * as orderService from "../services/order.service";
import * as paymentService from "../services/payment.service";
import { WorkspaceScopedRequest } from "../middleware/rbac.middleware";

const createOrderSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1),
});

const listOrdersQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const statusSchema = z.object({ status: z.nativeEnum(OrderStatus) });
const assignSchema = z.object({ assignedToId: z.string().uuid() });

export const createOrder = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = createOrderSchema.parse(req.body);
  const idempotencyKey = req.header("Idempotency-Key") || undefined;

  const order = await orderService.createOrder(req.params.workspaceId, { ...body, idempotencyKey });
  res.status(201).json(order);
});

export const listOrders = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const query = listOrdersQuerySchema.parse(req.query);
  const result = await orderService.listOrders(req.params.workspaceId, query);
  res.status(200).json(result);
});

export const getOrder = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const order = await orderService.getOrder(req.params.workspaceId, req.params.orderId);
  res.status(200).json(order);
});

export const updateStatus = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = statusSchema.parse(req.body);
  const order = await orderService.updateOrderStatus(req.params.workspaceId, req.params.orderId, body.status);
  res.status(200).json(order);
});

export const cancelOrder = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const order = await orderService.cancelOrder(req.params.workspaceId, req.params.orderId);
  res.status(200).json(order);
});

export const assignOrder = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = assignSchema.parse(req.body);
  const order = await orderService.assignOrder(req.params.workspaceId, req.params.orderId, body.assignedToId);
  res.status(200).json(order);
});

export const createCheckoutSession = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const result = await paymentService.createCheckoutSession(req.params.workspaceId, req.params.orderId);
  res.status(201).json(result);
});
