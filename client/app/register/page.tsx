"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register(email, password, name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your account — try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-mono text-xs uppercase tracking-widest2 text-amber-500">Fulfilio</p>
          <h1 className="mt-1 text-xl font-semibold text-graphite-50">Create your account</h1>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-graphite-700 bg-graphite-800/60 p-6">
          <Input id="name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Okafor" />
          <Input
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <Input
            id="password"
            label="Password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-graphite-400">
          Already have an account?{" "}
          <Link href="/login" className="text-amber-500 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
