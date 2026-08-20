import type { OrderStatus } from "@/lib/types";

const STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  PAID: "bg-freight-500/15 text-freight-400 border-freight-500/40",
  PROCESSING: "bg-freight-500/15 text-freight-400 border-freight-500/40",
  FULFILLING: "bg-freight-500/15 text-freight-400 border-freight-500/40",
  SHIPPED: "bg-freight-500/15 text-freight-400 border-freight-500/40",
  DELIVERED: "bg-signal-green/15 text-signal-green border-signal-green/40",
  CANCELLED: "bg-graphite-600/30 text-graphite-300 border-graphite-500/40",
  EXPIRED: "bg-graphite-600/30 text-graphite-300 border-graphite-500/40",
  REFUNDED: "bg-graphite-600/30 text-graphite-300 border-graphite-500/40",
  FAILED: "bg-signal-red/15 text-signal-red border-signal-red/40",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-xs tracking-wide transition-colors
        duration-150 motion-reduce:transition-none ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
