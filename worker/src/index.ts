import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { connection, QUEUE_NAMES } from "./queues";

const prisma = new PrismaClient();

// Each queue gets its own Worker so failures/concurrency are isolated per job
// type (a burst of invoice jobs shouldn't starve reservation-expiry checks).

new Worker(
  QUEUE_NAMES.ORDER_CONFIRMATION_EMAIL,
  async (job) => {
    // TODO: wire a real mail provider (Resend/SendGrid). Logging for now so the
    // pipeline is visible and testable before an email provider is chosen.
    console.log(`[order-confirmation-email] order ${job.data.orderId} → ${job.data.customerEmail}`);
  },
  { connection },
);

new Worker(
  QUEUE_NAMES.INVOICE_GENERATION,
  async (job) => {
    console.log(`[invoice-generation] generating invoice for order ${job.data.orderId}`);
    // TODO: render PDF, store it, attach URL to the order.
  },
  { connection },
);

new Worker(
  QUEUE_NAMES.LOW_STOCK_ALERT,
  async (job) => {
    console.log(`[low-stock-alert] product ${job.data.productId} below threshold`);
    // TODO: create Notification row + emit Socket.IO event to workspace.
  },
  { connection },
);

// The reservation-expiry job is queued with a delay when an order is created
// (PENDING). If the order is still PENDING when this runs, the reservation
// timed out — release the held stock and mark the order EXPIRED.
new Worker(
  QUEUE_NAMES.ORDER_RESERVATION_EXPIRY,
  async (job) => {
    const { orderId } = job.data as { orderId: string };

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || order.status !== "PENDING") return; // already paid/cancelled — nothing to do

      for (const item of order.items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { reserved: { decrement: item.quantity } },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: "EXPIRED" },
      });
    });

    console.log(`[order-reservation-expiry] released stock for expired order ${orderId}`);
  },
  { connection },
);

new Worker(
  QUEUE_NAMES.DAILY_SUMMARY_TRIGGER,
  async (job) => {
    console.log(`[daily-summary-trigger] workspace ${job.data.workspaceId}`);
    // TODO: call the AI summary generation and persist/notify.
  },
  { connection },
);

new Worker(
  QUEUE_NAMES.INVITATION_EMAIL,
  async (job) => {
    const { email, token, workspaceId, role } = job.data;
    const acceptUrl = `${process.env.CLIENT_URL ?? "http://localhost:3000"}/invitations/${token}/accept`;
    // TODO: real mail provider. Logging the accept link so the flow is testable end-to-end.
    console.log(`[invitation-email] ${email} invited to workspace ${workspaceId} as ${role} → ${acceptUrl}`);
  },
  { connection },
);

console.log("🛠  Fulfilio worker started — listening on all queues");
