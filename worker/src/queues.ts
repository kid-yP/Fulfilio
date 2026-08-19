import "dotenv/config";
import Redis from "ioredis";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// One queue name per job type. Kept as string constants (not an enum) so both
// the API (producer) and worker (consumer) can import the same values without
// sharing a build step.
export const QUEUE_NAMES = {
  ORDER_CONFIRMATION_EMAIL: "order-confirmation-email",
  INVOICE_GENERATION: "invoice-generation",
  LOW_STOCK_ALERT: "low-stock-alert",
  ORDER_RESERVATION_EXPIRY: "order-reservation-expiry", // delayed job — releases stock if unpaid
  DAILY_SUMMARY_TRIGGER: "daily-summary-trigger",
  INVITATION_EMAIL: "invitation-email",
} as const;
