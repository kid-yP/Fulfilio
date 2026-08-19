import { Response } from "express";
import { z } from "zod";
import { ProductStatus } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import * as productService from "../services/product.service";
import { WorkspaceScopedRequest } from "../middleware/rbac.middleware";

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  price: z.number().positive(),
  status: z.nativeEnum(ProductStatus).optional(),
  initialQuantity: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  price: z.number().positive().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

const listProductsQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});

export const createProduct = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = createProductSchema.parse(req.body);
  const product = await productService.createProduct(req.params.workspaceId, body);
  res.status(201).json(product);
});

export const listProducts = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const query = listProductsQuerySchema.parse(req.query);
  const result = await productService.listProducts(req.params.workspaceId, query);
  res.status(200).json(result);
});

export const getProduct = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const product = await productService.getProduct(req.params.workspaceId, req.params.productId);
  res.status(200).json(product);
});

export const updateProduct = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = updateProductSchema.parse(req.body);
  const product = await productService.updateProduct(req.params.workspaceId, req.params.productId, body);
  res.status(200).json(product);
});

export const deleteProduct = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  await productService.deleteProduct(req.params.workspaceId, req.params.productId);
  res.status(204).send();
});
