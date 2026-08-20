"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, getTokens, setTokens, clearTokens } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import type { AuthTokens, User } from "@/lib/types";

// The access token is a JWT with `sub`/`email` claims (see
// api/src/utils/tokens.ts) — decode it client-side purely to render "signed
// in as ___" without a round trip. Never trusted for authorization; every
// protected read/write is still enforced server-side.
function decodeUser(accessToken: string): User | null {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return { id: payload.sub, email: payload.email, name: payload.name ?? payload.email };
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const tokens = getTokens();
    if (tokens) setUser(decodeUser(tokens.accessToken));
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const tokens = await api.post<AuthTokens>("/api/v1/auth/login", { email, password }, { skipAuth: true });
    setTokens(tokens);
    setUser(decodeUser(tokens.accessToken));
    router.push("/");
  }

  async function register(email: string, password: string, name: string) {
    const tokens = await api.post<AuthTokens>(
      "/api/v1/auth/register",
      { email, password, name },
      { skipAuth: true },
    );
    setTokens(tokens);
    setUser(decodeUser(tokens.accessToken));
    router.push("/");
  }

  async function logout() {
    const tokens = getTokens();
    if (tokens) {
      try {
        await api.post("/api/v1/auth/logout", { refreshToken: tokens.refreshToken });
      } catch {
        // Best-effort — clear local state regardless of API reachability.
      }
    }
    clearTokens();
    disconnectSocket();
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
