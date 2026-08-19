import { Queue } from "bullmq";
import { redis } from "./redis";

// Kept in sync with worker/src/queues.ts by convention (not a shared package
// yet) — extracting these into a shared internal package is a reasonable
// follow-up once the queue list stabilizes.
export const QUEUE_NAMES = {
  ORDER_CONFIRMATION_EMAIL: "order-confirmation-email",
  INVOICE_GENERATION: "invoice-generation",
  LOW_STOCK_ALERT: "low-stock-alert",
  ORDER_RESERVATION_EXPIRY: "order-reservation-expiry",
  DAILY_SUMMARY_TRIGGER: "daily-summary-trigger",
  INVITATION_EMAIL: "invitation-email",
} as const;

export const invitationEmailQueue = new Queue(QUEUE_NAMES.INVITATION_EMAIL, { connection: redis });
export const orderReservationExpiryQueue = new Queue(QUEUE_NAMES.ORDER_RESERVATION_EXPIRY, { connection: redis });
export const orderConfirmationEmailQueue = new Queue(QUEUE_NAMES.ORDER_CONFIRMATION_EMAIL, { connection: redis });
export const invoiceGenerationQueue = new Queue(QUEUE_NAMES.INVOICE_GENERATION, { connection: redis });
export const lowStockAlertQueue = new Queue(QUEUE_NAMES.LOW_STOCK_ALERT, { connection: redis });
