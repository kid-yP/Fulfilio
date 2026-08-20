"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { api, ApiError } from "@/lib/api";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Paginated, Product } from "@/lib/types";

export default function ProductsPage() {
  const { current } = useWorkspace();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    setIsLoading(true);
    try {
      const page = await api.get<Paginated<Product>>(
        `/api/v1/workspaces/${current.id}/products?limit=100`,
      );
      setProducts(page.items);
    } finally {
      setIsLoading(false);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  async function adjustStock(productId: string, adjustment: number) {
    if (!current) return;
    setError(null);
    try {
      await api.patch(`/api/v1/workspaces/${current.id}/inventory/${productId}`, {
        adjustment,
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't adjust stock.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest2 text-graphite-500">
            {current?.name}
          </p>
          <h1 className="text-2xl font-semibold text-graphite-50">
            Products & inventory
          </h1>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add product"}
        </Button>
      </div>

      {error && <p className="text-sm text-signal-red">{error}</p>}

      {showForm && (
        <NewProductForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-graphite-700 text-left font-mono text-xs uppercase tracking-widest2 text-graphite-500">
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3">Price</th>
              <th className="px-5 py-3">Available</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-6 text-center text-graphite-500"
                >
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-6 text-center text-graphite-500"
                >
                  No products yet — add one to start tracking inventory.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const available = p.inventory
                  ? p.inventory.quantity - p.inventory.reserved
                  : 0;
                const low =
                  p.inventory &&
                  available <= p.inventory.lowStockThreshold;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-graphite-700/60 last:border-0"
                  >
                    <td className="px-5 py-3 text-graphite-100">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-graphite-400">
                      {p.sku}
                    </td>
                    <td className="px-5 py-3 font-mono tabular-nums text-graphite-200">
                      ${p.price}
                    </td>
                    <td
                      className={`px-5 py-3 font-mono tabular-nums ${
                        low ? "text-amber-400" : "text-graphite-200"
                      }`}
                    >
                      {available}
                      {p.inventory && ` (${p.inventory.reserved} reserved)`}
                    </td>
                    <td className="px-5 py-3 text-graphite-400">{p.status}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-1"
                          onClick={() => adjustStock(p.id, -1)}
                        >
                          −1
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-2 py-1"
                          onClick={() => adjustStock(p.id, 1)}
                        >
                          +1
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const { current } = useWorkspace();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/workspaces/${current.id}/products`, {
        name,
        sku,
        price: Number(price),
        initialQuantity: Number(initialQuantity),
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't create the product.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeading>New product</CardHeading>
      <form onSubmit={onSubmit} className="grid grid-cols-4 gap-4">
        <Input
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="SKU"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
        <Input
          label="Price"
          type="number"
          step="0.01"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Input
          label="Initial quantity"
          type="number"
          min="0"
          value={initialQuantity}
          onChange={(e) => setInitialQuantity(e.target.value)}
        />
        {error && <p className="col-span-4 text-sm text-signal-red">{error}</p>}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="col-span-4 justify-self-start"
        >
          {isSubmitting ? "Creating…" : "Create product"}
        </Button>
      </form>
    </Card>
  );
}