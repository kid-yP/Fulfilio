import http from "http";
import { env } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { initSocket } from "./realtime/socket";

const app = createApp();
const httpServer = http.createServer(app);
initSocket(httpServer);

const server = httpServer.listen(env.PORT, () => {
  console.log(`🚀 Fulfilio API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
