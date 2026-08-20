"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import type {
  Order,
  OrderStatus,
  OrderStatusChangedEvent,
  Paginated,
} from "@/lib/types";

const FILTERS: Array<{ label: string; value: OrderStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Paid", value: "PAID" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Fulfilling", value: "FULFILLING" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
];

export default function OrdersPage() {
  const { current } = useWorkspace();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!current) return;
    setIsLoading(true);
    try {
      const qs = filter === "ALL" ? "" : `&status=${filter}`;
      const page = await api.get<Paginated<Order>>(
        `/api/v1/workspaces/${current.id}/orders?limit=100${qs}`,
      );
      setOrders(page.items);
    } finally {
      setIsLoading(false);
    }
  }, [current, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onCreated = () => load();
    const onStatusChanged = (payload: OrderStatusChangedEvent) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === payload.orderId ? { ...o, status: payload.status } : o,
        ),
      );
    };

    socket.on("order:created", onCreated);
    socket.on("order:status_changed", onStatusChanged);

    return () => {
      socket.off("order:created", onCreated);
      socket.off("order:status_changed", onStatusChanged);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest2 text-graphite-500">
            {current?.name}
          </p>
          <h1 className="text-2xl font-semibold text-graphite-50">Orders</h1>
        </div>
        <Link href="/orders/new">
          <Button>New order</Button>
        </Link>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${
              filter === f.value
                ? "border-amber-500 bg-amber-500/10 text-amber-400"
                : "border-graphite-600 text-graphite-400 hover:border-graphite-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-graphite-700 text-left font-mono text-xs uppercase tracking-widest2 text-graphite-500">
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Placed</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-6 text-center text-graphite-500"
                >
                  Loading…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-6 text-center text-graphite-500"
                >
                  No orders in this view yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => (window.location.href = `/orders/${o.id}`)}
                  className="cursor-pointer border-b border-graphite-700/60 last:border-0 hover:bg-graphite-800/50"
                >
                  <td className="px-5 py-3 font-mono text-graphite-400">
                    {o.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3 text-graphite-100">
                    {o.customerName}
                  </td>
                  <td className="px-5 py-3 font-mono tabular-nums text-graphite-200">
                    ${o.total}
                  </td>
                  <td className="px-5 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-5 py-3 text-graphite-400">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}