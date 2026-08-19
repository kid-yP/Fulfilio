import Stripe from "stripe";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { emitToWorkspace } from "../realtime/socket";
import { orderConfirmationEmailQueue, invoiceGenerationQueue } from "../lib/queues";

const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

export async function createCheckoutSession(workspaceId: string, orderId: string) {
  if (!stripe) throw new AppError(503, "Payments are not configured (missing STRIPE_SECRET_KEY)");

  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId },
    include: { items: { include: { product: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status !== OrderStatus.PENDING) {
    throw new AppError(409, "Only PENDING orders can be checked out");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.customerEmail,
    line_items: order.items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.product.name },
        unit_amount: Math.round(Number(item.unitPrice) * 100),
      },
      quantity: item.quantity,
    })),
    success_url: `${env.CLIENT_URL}/orders/${order.id}?checkout=success`,
    cancel_url: `${env.CLIENT_URL}/orders/${order.id}?checkout=cancelled`,
    metadata: { orderId: order.id, workspaceId },
  });

  await prisma.payment.upsert({
    where: { orderId: order.id },
    update: { stripeCheckoutSessionId: session.id, status: PaymentStatus.PENDING, amount: order.total },
    create: {
      orderId: order.id,
      stripeCheckoutSessionId: session.id,
      status: PaymentStatus.PENDING,
      amount: order.total,
    },
  });

  return { checkoutUrl: session.url };
}

export async function handleWebhookEvent(rawBody: Buffer, signature: string) {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "Webhooks are not configured");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, "Invalid webhook signature");
  }

  // Idempotency guard: Stripe retries webhook delivery on anything short of a
  // 2xx response, so replays are expected and normal — this makes a replay a
  // deliberate no-op instead of double-processing the order.
  const alreadyProcessed = await prisma.webhookEvent.findUnique({ where: { stripeEventId: event.id } });
  if (alreadyProcessed) return { received: true, duplicate: true };

  await prisma.webhookEvent.create({ data: { stripeEventId: event.id, type: event.type } });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId) await markOrderPaid(orderId, session.id);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId) await markOrderFailed(orderId);
      break;
    }
    default:
      break; // other event types intentionally ignored in v1
  }

  return { received: true, duplicate: false };
}

async function markOrderPaid(orderId: string, checkoutSessionId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.PENDING) return null; // already handled, e.g. by a duplicate delivery

    await tx.payment.update({
      where: { orderId },
      data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date(), stripeCheckoutSessionId: checkoutSessionId },
    });
    return tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID, paidAt: new Date() } });
  });

  if (!result) return;

  emitToWorkspace(result.workspaceId, "order:status_changed", { orderId, status: OrderStatus.PAID });
  await orderConfirmationEmailQueue.add("payment-confirmed", { orderId, customerEmail: result.customerEmail });
  await invoiceGenerationQueue.add("generate-invoice", { orderId });
}

async function markOrderFailed(orderId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== OrderStatus.PENDING) return null;

    for (const item of order.items) {
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { reserved: { decrement: item.quantity } },
      });
    }

    await tx.payment.updateMany({ where: { orderId }, data: { status: PaymentStatus.FAILED } });
    return tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.FAILED } });
  });

  if (!result) return;
  emitToWorkspace(result.workspaceId, "order:status_changed", { orderId, status: OrderStatus.FAILED });
}
