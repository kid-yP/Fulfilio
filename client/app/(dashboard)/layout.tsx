"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products & inventory" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { workspaces, current, isLoading: wsLoading, selectWorkspace, createWorkspace, onlineCount } =
    useWorkspace();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-graphite-900">
        <p className="font-mono text-sm tracking-widest2 text-graphite-400">LOADING…</p>
      </div>
    );
  }

  if (!wsLoading && workspaces.length === 0) {
    return <FirstWorkspacePrompt onCreate={createWorkspace} />;
  }

  return (
    <div className="flex min-h-screen bg-graphite-900">
      <aside className="flex w-60 flex-col border-r border-graphite-700 bg-graphite-950">
        <div className="border-b border-graphite-700 px-5 py-5">
          <p className="font-mono text-xs uppercase tracking-widest2 text-amber-500">Fulfilio</p>
          {current && (
            <select
              value={current.id}
              onChange={(e) => selectWorkspace(e.target.value)}
              className="mt-2 w-full truncate rounded border border-graphite-700 bg-graphite-900 px-2 py-1.5 text-sm text-graphite-100"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm transition-colors duration-150 motion-reduce:transition-none ${
                  active
                    ? "bg-graphite-800 text-amber-400"
                    : "text-graphite-300 hover:bg-graphite-800/60 hover:text-graphite-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-graphite-700 px-5 py-4">
          <div className="mb-3 flex items-center gap-2 font-mono text-xs text-graphite-400">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-green" aria-hidden />
            {onlineCount} online in this workspace
          </div>
          <p className="truncate text-xs text-graphite-500">{user.email}</p>
          <button
            onClick={() => logout()}
            className="mt-1 text-xs text-graphite-400 underline decoration-graphite-600 hover:text-amber-400"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}

function FirstWorkspacePrompt({ onCreate }: { onCreate: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate(name);
    } catch {
      setError("Couldn't create the workspace — try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-900 px-4">
      <div className="w-full max-w-sm">
        <p className="font-mono text-xs uppercase tracking-widest2 text-amber-500">Fulfilio</p>
        <h1 className="mt-1 text-xl font-semibold text-graphite-50">Set up your first workspace</h1>
        <p className="mt-2 text-sm text-graphite-400">
          A workspace holds one team's products, orders, and members. You can invite teammates once it's created.
        </p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 rounded-lg border border-graphite-700 bg-graphite-800/60 p-6">
          <Input
            id="workspace-name"
            label="Workspace name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Fulfillment"
          />
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
