import Redis from "ioredis";
import { env } from "../config/env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ when this client is reused for queues
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});
