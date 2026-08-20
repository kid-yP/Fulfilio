"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { api, ApiError } from "@/lib/api";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Order, Paginated, Product } from "@/lib/types";

interface LineItem {
  productId: string;
  quantity: number;
}

export default function NewOrderPage() {
  const { current } = useWorkspace();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { productId: "", quantity: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    if (!current) return;

    api
      .get<Paginated<Product>>(
        `/api/v1/workspaces/${current.id}/products?limit=100&status=ACTIVE`,
      )
      .then((page) => setProducts(page.items))
      .catch(() => setProducts([]));
  }, [current]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const validItems = items.filter((it) => it.productId && it.quantity > 0);

      const order = await api.post<Order>(
        `/api/v1/workspaces/${current.id}/orders`,
        { customerName, customerEmail, items: validItems },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );

      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't create the order.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest2 text-graphite-500">
          {current?.name}
        </p>
        <h1 className="text-2xl font-semibold text-graphite-50">New order</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeading>Customer</CardHeading>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              required
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <CardHeading>Items</CardHeading>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-end gap-3">
                <Select
                  label={i === 0 ? "Product" : undefined}
                  className="flex-1"
                  value={item.productId}
                  onChange={(e) => updateItem(i, { productId: e.target.value })}
                  required
                >
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.price}
                    </option>
                  ))}
                </Select>
                <Input
                  label={i === 0 ? "Qty" : undefined}
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(i, { quantity: Number(e.target.value) })
                  }
                  className="w-24"
                />
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeItem(i)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={addItem}
              className="w-fit"
            >
              + Add item
            </Button>
          </div>
        </Card>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "Placing order…" : "Place order"}
        </Button>
      </form>
    </div>
  );
}