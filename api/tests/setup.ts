import { prisma } from "../src/lib/prisma";

// Truncate in an order that respects foreign keys, and RESTART IDENTITY so
// autoincrement-free UUID tests stay deterministic across runs.
export async function resetDatabase() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.product.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.workspaceMember.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

afterAll(async () => {
  await prisma.$disconnect();
});
