import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { bumpCacheVersion } from "./product.service";
import { lowStockAlertQueue } from "../lib/queues";
import { emitToWorkspace } from "../realtime/socket";

export async function getInventory(workspaceId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, workspaceId } });
  if (!product) throw new AppError(404, "Product not found");

  const inventory = await prisma.inventory.findUnique({ where: { productId } });
  if (!inventory) throw new AppError(404, "Inventory record not found");
  return inventory;
}

interface InventoryRow {
  id: string;
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
}

// Applies a signed delta to quantity (positive = receiving stock, negative =
// write-off/correction) inside a transaction that takes a row-level lock via
// SELECT ... FOR UPDATE. This is the same pattern Orders uses to reserve
// stock — introduced here first so the concurrency-safety story is already
// proven before Orders depends on it.
//
// Invariants enforced: quantity >= 0, reserved <= quantity.
export async function adjustInventory(workspaceId: string, productId: string, adjustment: number) {
  const product = await prisma.product.findFirst({ where: { id: productId, workspaceId } });
  if (!product) throw new AppError(404, "Product not found");

  const updated = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<InventoryRow[]>`
      SELECT id, quantity, reserved, "lowStockThreshold" FROM "Inventory" WHERE "productId" = ${productId} FOR UPDATE
    `;
    const inventory = rows[0];
    if (!inventory) throw new AppError(404, "Inventory record not found");

    const newQuantity = inventory.quantity + adjustment;

    if (newQuantity < 0) {
      throw new AppError(400, "Adjustment would make quantity negative");
    }
    if (newQuantity < inventory.reserved) {
      throw new AppError(400, "Adjustment would reduce quantity below stock already reserved by pending orders");
    }

    return tx.inventory.update({
      where: { productId },
      data: { quantity: newQuantity },
    });
  });

  await bumpCacheVersion(workspaceId); // product listing embeds inventory — must invalidate too

  if (updated.quantity <= updated.lowStockThreshold) {
    emitToWorkspace(workspaceId, "inventory:low_stock", {
      productId,
      productName: product.name,
      quantity: updated.quantity,
      threshold: updated.lowStockThreshold,
    });
    // Async side effect (e.g. emailing whoever manages purchasing) — kept
    // separate from the synchronous real-time emit above, which is what
    // actually updates connected clients' UI immediately.
    await lowStockAlertQueue.add("low-stock", {
      workspaceId,
      productId,
      productName: product.name,
      quantity: updated.quantity,
    });
  }

  return updated;
}
