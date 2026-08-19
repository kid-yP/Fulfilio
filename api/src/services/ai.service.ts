import Anthropic from "@anthropic-ai/sdk";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function gatherDailyStats(workspaceId: string) {
  const since = startOfToday();

  const [ordersToday, allInventory, failedPaymentsToday, deliveredToday] = await Promise.all([
    prisma.order.findMany({ where: { workspaceId, createdAt: { gte: since } }, select: { status: true } }),
    prisma.inventory.findMany({
      where: { product: { workspaceId } },
      include: { product: true },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.FAILED, order: { workspaceId }, updatedAt: { gte: since } },
    }),
    prisma.order.findMany({
      where: { workspaceId, status: OrderStatus.DELIVERED, deliveredAt: { gte: since } },
      select: { createdAt: true, deliveredAt: true },
    }),
  ]);

  const trulyLowStock = allInventory.filter((inv) => inv.quantity <= inv.lowStockThreshold);

  const statusCounts = ordersToday.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const fulfillmentMinutes = deliveredToday
    .filter((o) => o.deliveredAt)
    .map((o) => (o.deliveredAt!.getTime() - o.createdAt.getTime()) / 60000);
  const avgFulfillmentMinutes = fulfillmentMinutes.length
    ? Math.round(fulfillmentMinutes.reduce((a, b) => a + b, 0) / fulfillmentMinutes.length)
    : null;

  return {
    ordersCreatedToday: ordersToday.length,
    statusCounts,
    lowStockCount: trulyLowStock.length,
    lowStockProducts: trulyLowStock.map((inv) => ({ name: inv.product.name, quantity: inv.quantity })),
    failedPaymentsToday,
    deliveredToday: deliveredToday.length,
    avgFulfillmentMinutes,
  };
}

function templateSummary(stats: Awaited<ReturnType<typeof gatherDailyStats>>): string {
  const lines = [
    `${stats.ordersCreatedToday} order(s) created today.`,
    stats.deliveredToday > 0
      ? `${stats.deliveredToday} delivered${stats.avgFulfillmentMinutes != null ? ` (avg fulfillment time: ${stats.avgFulfillmentMinutes} min)` : ""}.`
      : null,
    stats.lowStockCount > 0
      ? `${stats.lowStockCount} product(s) below their low-stock threshold: ${stats.lowStockProducts.map((p) => p.name).join(", ")}.`
      : "No products below their low-stock threshold.",
    stats.failedPaymentsToday > 0 ? `${stats.failedPaymentsToday} failed payment(s) today.` : null,
  ].filter(Boolean);

  return lines.join(" ");
}

export async function generateDailySummary(workspaceId: string) {
  const stats = await gatherDailyStats(workspaceId);

  if (!anthropic) {
    return { stats, summary: templateSummary(stats), generatedBy: "template" as const };
  }

  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are an operations assistant. Write a concise (3-4 sentence) daily fulfillment summary for a warehouse team based on this data. Be factual and specific to the numbers given — don't invent details. Data: ${JSON.stringify(stats)}`,
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  const summary = text && "text" in text ? text.text : templateSummary(stats);

  return { stats, summary, generatedBy: "ai" as const };
}

interface TriageOrder {
  id: string;
  customerName: string;
  status: OrderStatus;
  createdAt: Date;
  ageMinutes: number;
}

async function gatherTriageCandidates(workspaceId: string): Promise<TriageOrder[]> {
  const orders = await prisma.order.findMany({
    where: { workspaceId, status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING] } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  const now = Date.now();
  return orders.map((o) => ({
    id: o.id,
    customerName: o.customerName,
    status: o.status,
    createdAt: o.createdAt,
    ageMinutes: Math.round((now - o.createdAt.getTime()) / 60000),
  }));
}

function templateTriage(orders: TriageOrder[]) {
  // Deterministic fallback: oldest orders first — simple, defensible, and
  // exactly what a human would default to without more information.
  return [...orders]
    .sort((a, b) => b.ageMinutes - a.ageMinutes)
    .slice(0, 10)
    .map((o) => ({ orderId: o.id, reason: `Waiting ${o.ageMinutes} min (oldest first)` }));
}

export async function generateTriage(workspaceId: string) {
  const orders = await gatherTriageCandidates(workspaceId);

  if (orders.length === 0) {
    return { recommendations: [], generatedBy: "template" as const };
  }

  if (!anthropic) {
    return { recommendations: templateTriage(orders), generatedBy: "template" as const };
  }

  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are helping a warehouse team prioritize which orders to work on next. Given this list of open orders (JSON), return the top 10 in priority order with a one-sentence reason each. Respond as JSON only: an array of {"orderId": string, "reason": string}. Orders: ${JSON.stringify(orders)}`,
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  if (text && "text" in text) {
    try {
      const parsed = JSON.parse(text.text);
      if (Array.isArray(parsed)) return { recommendations: parsed, generatedBy: "ai" as const };
    } catch {
      // fall through to template
    }
  }

  return { recommendations: templateTriage(orders), generatedBy: "template" as const };
}
