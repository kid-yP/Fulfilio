import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken } from "../services/auth.service";
import { prisma } from "../lib/prisma";

let io: Server | null = null;

// One process hosts the Socket.IO server: the API. The worker process (which
// runs in a separate container) cannot emit directly — jobs that need to
// notify connected clients go through DB state changes the API reads, or are
// deliberately left as a documented gap (see README "known limitations": the
// reservation-expiry job updates the DB but doesn't push a live socket event,
// since bridging a second process into this Socket.IO instance would need a
// pub/sub adapter — a reasonable v2 addition, not built here to avoid
// overengineering a single-instance app).
export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Unauthorized"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("workspace:join", async (workspaceId: string) => {
      if (typeof workspaceId !== "string") return;

      // Same rule as the HTTP RBAC middleware: prove membership before
      // letting the socket receive anything scoped to this workspace.
      const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: socket.data.userId, workspaceId } },
      });
      if (!membership) return;

      socket.data.workspaceId = workspaceId;
      socket.join(roomName(workspaceId));
      socket.to(roomName(workspaceId)).emit("presence:online", { userId: socket.data.userId });

      const room = io!.sockets.adapter.rooms.get(roomName(workspaceId));
      const onlineCount = room?.size ?? 1;
      socket.emit("presence:snapshot", { onlineCount });
    });

    socket.on("order:viewing", (orderId: string) => {
      if (!socket.data.workspaceId) return;
      socket.to(roomName(socket.data.workspaceId)).emit("presence:viewing", {
        userId: socket.data.userId,
        orderId,
      });
    });

    socket.on("disconnect", () => {
      if (socket.data.workspaceId) {
        socket.to(roomName(socket.data.workspaceId)).emit("presence:offline", {
          userId: socket.data.userId,
        });
      }
    });
  });

  return io;
}

function roomName(workspaceId: string) {
  return `workspace:${workspaceId}`;
}

// Called synchronously from services right after a state change commits —
// e.g. after an order status update transaction succeeds. Safe to call even
// if no clients are connected (emits to an empty room, a no-op).
export function emitToWorkspace(workspaceId: string, event: string, payload: unknown) {
  io?.to(roomName(workspaceId)).emit(event, payload);
}
