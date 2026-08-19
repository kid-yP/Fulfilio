import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { env } from "../config/env";
import {
  orderReservationExpiryQueue,
  orderConfirmationEmailQueue,
} from "../lib/queues";
import { emitToWorkspace } from "../realtime/socket";
import { notifyUser } from "./notification.service";

interface OrderItemInput {
  productId: string;
  quantity: number;
}

interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  items: OrderItemInput[];
  idempotencyKey?: string;
}

interface InventoryLockRow {
  quantity: number;
  reserved: number;
}

// The core concurrency-safety guarantee of the whole app: two requests racing
// to buy the last unit of a product must never both succeed.
//
// - Items are locked in a deterministic order (sorted by productId) so two
//   orders touching the same set of products always acquire row locks in the
//   same sequence — this is what prevents a classic lock-ordering deadlock.
// - Each row is locked with SELECT ... FOR UPDATE before we read it, so a
//   second transaction touching the same product genuinely waits for the
//   first to commit or roll back, rather than reading a stale snapshot.
// - The whole thing is one Prisma $transaction: if ANY item is out of stock,
//   the entire order (including any reservations already made for earlier
//   items in the same request) rolls back — no partial reservations.
export async function createOrder(workspaceId: string, input: CreateOrderInput) {
  if (input.items.length === 0) {
    throw new AppError(400, "An order must contain at least one item");
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const sortedItems = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));

      let subtotal = new Prisma.Decimal(0);
      const orderItemsData: { productId: string; quantity: number; unitPrice: Prisma.Decimal }[] = [];

      for (const item of sortedItems) {
        const product = await tx.product.findFirst({ where: { id: item.productId, workspaceId } });
        if (!product) throw new AppError(404, `Product ${item.productId} not found in this workspace`);

        const rows = await tx.$queryRaw<InventoryLockRow[]>`
          SELECT quantity, reserved FROM "Inventory" WHERE "productId" = ${item.productId} FOR UPDATE
        `;
        const inventory = rows[0];
        if (!inventory) throw new AppError(404, `No inventory record for product ${product.name}`);

        const available = inventory.quantity - inventory.reserved;
        if (available < item.quantity) {
          throw new AppError(409, `Insufficient stock for "${product.name}" (${available} available)`);
        }

        await tx.inventory.update({
          where: { productId: item.productId },
          data: { reserved: { increment: item.quantity } },
        });

        subtotal = subtotal.plus(product.price.times(item.quantity));
        orderItemsData.push({ productId: item.productId, quantity: item.quantity, unitPrice: product.price });
      }

      return tx.order.create({
        data: {
          workspaceId,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          status: OrderStatus.PENDING,
          subtotal,
          total: subtotal, // no tax/shipping in v1
          idempotencyKey: input.idempotencyKey,
          items: { create: orderItemsData },
        },
        include: { items: true },
      });
    });

    // Side effects only after the transaction has actually committed.
    await orderReservationExpiryQueue.add(
      "expire-reservation",
      { orderId: order.id },
      { delay: env.RESERVATION_WINDOW_MINUTES * 60 * 1000 },
    );
    await orderConfirmationEmailQueue.add("order-created", {
      orderId: order.id,
      customerEmail: order.customerEmail,
    });
    emitToWorkspace(workspaceId, "order:created", { orderId: order.id, status: order.status });

    return order;
  } catch (err) {
    // A repeated Idempotency-Key hits the unique constraint on Order.idempotencyKey.
    // Rather than surface a 409 to a client that's just retrying a double-click,
    // return the order that already exists for that key.
    if (
      input.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      (err.meta?.target as string[] | undefined)?.includes("idempotencyKey")
    ) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { items: true },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

interface ListOrdersQuery {
  status?: OrderStatus;
  page: number;
  limit: number;
}

export async function listOrders(workspaceId: string, query: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = { workspaceId };
  if (query.status) where.status = query.status;

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
}

export async function getOrder(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId },
    include: { items: { include: { product: true } }, payment: true, assignedTo: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
  return order;
}

// Explicit allow-list for the order state machine — anything not listed here
// is rejected with a 400 rather than silently allowed. Keeps illegal jumps
// (e.g. PENDING straight to DELIVERED) impossible at the API layer.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.FAILED],
  PAID: [OrderStatus.PROCESSING, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  PROCESSING: [OrderStatus.FULFILLING, OrderStatus.CANCELLED],
  FULFILLING: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
  FAILED: [],
};

const RESERVED_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLING,
];

export async function updateOrderStatus(workspaceId: string, orderId: string, newStatus: OrderStatus) {
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, workspaceId }, include: { items: true } });
    if (!order) throw new AppError(404, "Order not found");

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      throw new AppError(400, `Cannot transition order from ${order.status} to ${newStatus}`);
    }

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: newStatus };
    if (newStatus === OrderStatus.PAID) data.paidAt = now;
    if (newStatus === OrderStatus.SHIPPED) data.shippedAt = now;
    if (newStatus === OrderStatus.DELIVERED) data.deliveredAt = now;
    if (newStatus === OrderStatus.CANCELLED) data.cancelledAt = now;

    // Releasing the reservation here (not just on expiry) means a manual
    // cancellation frees stock immediately instead of waiting out the window.
    if (newStatus === OrderStatus.CANCELLED && RESERVED_STATUSES.includes(order.status)) {
      for (const item of order.items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { reserved: { decrement: item.quantity } },
        });
      }
    }

    return tx.order.update({ where: { id: orderId }, data });
  });

  emitToWorkspace(workspaceId, "order:status_changed", { orderId, status: newStatus });
  return updated;
}

export async function cancelOrder(workspaceId: string, orderId: string) {
  return updateOrderStatus(workspaceId, orderId, OrderStatus.CANCELLED);
}

export async function assignOrder(workspaceId: string, orderId: string, assignedToId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, workspaceId } });
  if (!order) throw new AppError(404, "Order not found");

  const assignee = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: assignedToId, workspaceId } },
  });
  if (!assignee) throw new AppError(400, "assignedToId must be a member of this workspace");

  const updated = await prisma.order.update({ where: { id: orderId }, data: { assignedToId } });

  emitToWorkspace(workspaceId, "order:assigned", { orderId, assignedToId });
  await notifyUser(workspaceId, assignedToId, "ORDER_ASSIGNED", `You were assigned order ${orderId.slice(0, 8)}`);

  return updated;
}
