import { prisma } from "../lib/prisma";
import { emitToWorkspace } from "../realtime/socket";

// This is the whole "notification system": no separate subsystem, just a
// Notification row plus a socket emit riding the same workspace room every
// other real-time event uses. Clients filter by comparing notification.userId
// to their own id.
export async function notifyUser(workspaceId: string, userId: string, type: string, message: string) {
  const notification = await prisma.notification.create({
    data: { workspaceId, userId, type, message },
  });
  emitToWorkspace(workspaceId, "notification:new", notification);
  return notification;
}
