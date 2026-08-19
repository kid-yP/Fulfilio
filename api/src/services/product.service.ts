import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { AppError } from "../middleware/errorHandler";

interface CreateProductInput {
  name: string;
  sku: string;
  description?: string;
  category?: string;
  price: number;
  status?: ProductStatus;
  initialQuantity?: number;
  lowStockThreshold?: number;
}

interface UpdateProductInput {
  name?: string;
  sku?: string;
  description?: string;
  category?: string;
  price?: number;
  status?: ProductStatus;
}

interface ListProductsQuery {
  search?: string;
  category?: string;
  status?: ProductStatus;
  page: number;
  limit: number;
  sort?: string; // "field:asc" | "field:desc"
}

const SORTABLE_FIELDS = new Set(["name", "price", "createdAt", "updatedAt"]);

// Version-based cache invalidation: rather than deleting every cached page/
// filter combination on a write (which needs a Redis SCAN), we bump a single
// version counter per workspace. It's baked into every cache key below, so a
// bump instantly makes all previously-cached pages unreachable; old entries
// just expire naturally via their TTL instead of being actively deleted.
async function getCacheVersion(workspaceId: string): Promise<string> {
  const v = await redis.get(`products:version:${workspaceId}`);
  return v ?? "0";
}

export async function bumpCacheVersion(workspaceId: string) {
  await redis.incr(`products:version:${workspaceId}`);
}

export async function createProduct(workspaceId: string, input: CreateProductInput) {
  try {
    // Product + its Inventory row are created together — a product with no
    // inventory record is an invalid state the rest of the app shouldn't have
    // to defensively check for.
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          workspaceId,
          name: input.name,
          sku: input.sku,
          description: input.description,
          category: input.category,
          price: input.price,
          status: input.status ?? ProductStatus.ACTIVE,
        },
      });

      await tx.inventory.create({
        data: {
          productId: product.id,
          quantity: input.initialQuantity ?? 0,
          lowStockThreshold: input.lowStockThreshold ?? 5,
        },
      });

      return product;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "A product with this SKU already exists in this workspace");
    }
    throw err;
  } finally {
    await bumpCacheVersion(workspaceId);
  }
}

export async function listProducts(workspaceId: string, query: ListProductsQuery) {
  const version = await getCacheVersion(workspaceId);
  const cacheKey = `products:${workspaceId}:v${version}:${JSON.stringify(query)}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const where: Prisma.ProductWhereInput = { workspaceId };

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { sku: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;

  let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
  if (query.sort) {
    const [field, dir] = query.sort.split(":");
    if (SORTABLE_FIELDS.has(field) && (dir === "asc" || dir === "desc")) {
      orderBy = { [field]: dir };
    }
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { inventory: true },
      orderBy,
      skip,
      take: query.limit,
    }),
    prisma.product.count({ where }),
  ]);

  const result = {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };

  // Short TTL — this is a demonstration of the caching mechanism (cache hit
  // vs. miss, invalidation on write), not an attempt to squeeze maximum
  // freshness/latency trade-off out of a real production catalog.
  await redis.set(cacheKey, JSON.stringify(result), "EX", 30);

  return result;
}

// Scoping every lookup by workspaceId (not just product id) is what makes this
// safe against cross-tenant access — a valid product id from Workspace B
// simply won't match `findFirst` here and returns the same 404 as a fake id.
export async function getProduct(workspaceId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
    include: { inventory: true },
  });
  if (!product) throw new AppError(404, "Product not found");
  return product;
}

export async function updateProduct(workspaceId: string, productId: string, input: UpdateProductInput) {
  await getProduct(workspaceId, productId); // 404s if it doesn't belong to this workspace

  try {
    return await prisma.product.update({
      where: { id: productId },
      data: input,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "A product with this SKU already exists in this workspace");
    }
    throw err;
  } finally {
    await bumpCacheVersion(workspaceId);
  }
}

export async function deleteProduct(workspaceId: string, productId: string) {
  await getProduct(workspaceId, productId);

  try {
    await prisma.product.delete({ where: { id: productId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      // Foreign key violation — order items still reference this product.
      throw new AppError(409, "Cannot delete a product with existing orders — set it to ARCHIVED instead");
    }
    throw err;
  } finally {
    await bumpCacheVersion(workspaceId);
  }
}
