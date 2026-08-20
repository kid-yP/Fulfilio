import type { AuthTokens } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ACCESS_KEY = "fulfilio.accessToken";
const REFRESH_KEY = "fulfilio.refreshToken";

export function getTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function setTokens(tokens: AuthTokens) {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  // Skip the Authorization header (auth endpoints only).
  skipAuth?: boolean;
}

// Single-flight refresh: if several requests 401 at once, only one
// refresh call is made and the rest wait on it.
let refreshPromise: Promise<AuthTokens> | null = null;

async function doRefresh(): Promise<AuthTokens> {
  const current = getTokens();
  if (!current) throw new ApiError(401, "Not authenticated");

  const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    throw new ApiError(res.status, "Session expired");
  }

  const tokens = (await res.json()) as AuthTokens;
  setTokens(tokens);
  return tokens;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  const doFetch = async (): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (!skipAuth) {
      const tokens = getTokens();
      if (tokens) finalHeaders.Authorization = `Bearer ${tokens.accessToken}`;
    }

    return fetch(`${API_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  // Access tokens are short-lived (15m by default) — a 401 on an
  // authenticated call means "try a refresh, then retry once" rather
  // than an immediate failure.
  if (res.status === 401 && !skipAuth && getTokens()) {
    try {
      refreshPromise = refreshPromise ?? doRefresh();
      await refreshPromise;
    } catch {
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "Session expired — please sign in again");
    } finally {
      refreshPromise = null;
    }
    res = await doFetch();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = data?.error?.message ?? data?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

export { API_URL };
