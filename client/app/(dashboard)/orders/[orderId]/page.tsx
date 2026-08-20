"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getSocket } from "@/lib/socket";
import { api, ApiError } from "@/lib/api";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderPipeline } from "@/components/OrderPipeline";
import {
  ORDER_PIPELINE_STAGES,
  type Order,
  type OrderAssignedEvent,
  type OrderStatus,
  type OrderStatusChangedEvent,
  type WorkspaceMember,
} from "@/lib/types";

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { current } = useWorkspace();
  const [order, setOrder] = useState<Order | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    setIsLoading(true);
    try {
      const [o, m] = await Promise.all([
        api.get<Order>(`/api/v1/workspaces/${current.id}/orders/${orderId}`),
        api.get<WorkspaceMember[]>(`/api/v1/workspaces/${current.id}/members`),
      ]);
      setOrder(o);
      setMembers(m);
    } finally {
      setIsLoading(false);
    }
  }, [current, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Announce presence on this order and patch state in place as realtime
  // events land, so two staff viewing the same order see each other's
  // changes without a manual refresh.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !orderId) return;
    socket.emit("order:viewing", orderId);

    const onStatusChanged = (payload: OrderStatusChangedEvent) => {
      if (payload.orderId !== orderId) return;
      setOrder((prev) => (prev ? { ...prev, status: payload.status } : prev));
    };
    const onAssigned = (payload: OrderAssignedEvent) => {
      if (payload.orderId !== orderId) return;
      setOrder((prev) => (prev ? { ...prev, assignedToId: payload.assignedToId } : prev));
    };

    socket.on("order:status_changed", onStatusChanged);
    socket.on("order:assigned", onAssigned);
    return () => {
      socket.off("order:status_changed", onStatusChanged);
      socket.off("order:assigned", onAssigned);
    };
  }, [orderId]);

  async function updateStatus(status: OrderStatus) {
    if (!current || !order) return;
    setActionError(null);
    try {
      const updated = await api.patch<Order>(
        `/api/v1/workspaces/${current.id}/orders/${order.id}/status`,
        { status },
      );
      setOrder(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't update the status.");
    }
  }

  async function cancelOrder() {
    if (!current || !order) return;
    setActionError(null);
    try {
      const updated = await api.post<Order>(`/api/v1/workspaces/${current.id}/orders/${order.id}/cancel`);
      setOrder(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't cancel the order.");
    }
  }

  async function assignTo(userId: string) {
    if (!current || !order || !userId) return;
    setActionError(null);
    try {
      const updated = await api.patch<Order>(
        `/api/v1/workspaces/${current.id}/orders/${order.id}/assignment`,
        { assignedToId: userId },
      );
      setOrder(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't assign the order — you may need OWNER/MANAGER.");
    }
  }

  async function startCheckout() {
    if (!current || !order) return;
    setActionError(null);
    try {
      const result = await api.post<{ checkoutUrl: string }>(
        `/api/v1/workspaces/${current.id}/orders/${order.id}/checkout`,
      );
      setCheckoutUrl(result.checkoutUrl);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Couldn't start checkout — Stripe may not be configured.",
      );
    }
  }

  if (isLoading || !order) {
    return <p className="font-mono text-sm text-graphite-500">Loading…</p>;
  }

  const nextStageIndex = ORDER_PIPELINE_STAGES.indexOf(order.status) + 1;
  const nextStage = ORDER_PIPELINE_STAGES[nextStageIndex];
  const isCancellable = !["DELIVERED", "CANCELLED", "EXPIRED", "REFUNDED", "FAILED"].includes(order.status);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest2 text-graphite-500">Order {order.id.slice(0, 8)}</p>
          <h1 className="text-2xl font-semibold text-graphite-50">{order.customerName}</h1>
          <p className="text-sm text-graphite-400">{order.customerEmail}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <Card>
        <CardHeading>Fulfillment stage</CardHeading>
        <OrderPipeline status={order.status} />
      </Card>

      {actionError && <p className="text-sm text-signal-red">{actionError}</p>}
      {checkoutUrl && (
        <p className="text-sm text-graphite-300">
          Checkout session ready:{" "}
          <a href={checkoutUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">
            open Stripe checkout ↗
          </a>
        </p>
      )}

      <Card>
        <CardHeading>Actions</CardHeading>
        <div className="flex flex-wrap gap-3">
          {order.status === "PENDING" && <Button onClick={startCheckout}>Start checkout</Button>}
          {nextStage && order.status !== "PENDING" && (
            <Button onClick={() => updateStatus(nextStage)}>Advance to {nextStage}</Button>
          )}
          {isCancellable && (
            <Button variant="danger" onClick={cancelOrder}>
              Cancel order
            </Button>
          )}
        </div>

        <div className="mt-5 max-w-xs">
          <Select
            label="Assigned to"
            value={order.assignedToId ?? ""}
            onChange={(e) => assignTo(e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user?.name ?? m.user?.email ?? m.userId.slice(0, 8)} ({m.role})
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        <CardHeading>Items</CardHeading>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-graphite-700 text-left font-mono text-xs uppercase tracking-widest2 text-graphite-500">
              <th className="py-2">Product</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Unit price</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map((item) => (
              <tr key={item.id} className="border-b border-graphite-700/60 last:border-0">
                <td className="py-2 text-graphite-100">{item.product?.name ?? item.productId.slice(0, 8)}</td>
                <td className="py-2 font-mono tabular-nums text-graphite-300">{item.quantity}</td>
                <td className="py-2 font-mono tabular-nums text-graphite-300">${item.unitPrice}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end gap-8 font-mono text-sm">
          <span className="text-graphite-400">Subtotal ${order.subtotal}</span>
          <span className="font-semibold text-graphite-50">Total ${order.total}</span>
        </div>
      </Card>
    </div>
  );
}
