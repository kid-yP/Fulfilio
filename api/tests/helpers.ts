import request from "supertest";
import { createApp } from "../src/app";

export const app = createApp();

let userCounter = 0;

export async function registerUser(overrides: { email?: string; password?: string; name?: string } = {}) {
  userCounter += 1;
  const email = overrides.email ?? `user${userCounter}@test.dev`;
  const password = overrides.password ?? "supersecret1";
  const name = overrides.name ?? `Test User ${userCounter}`;

  const res = await request(app).post("/api/v1/auth/register").send({ email, password, name });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { email, password, name, accessToken: res.body.accessToken as string };
}

export function authed(token: string) {
  return {
    get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${token}`),
  };
}

export async function makeWorkspace(ownerToken: string, name = "Acme") {
  const res = await authed(ownerToken).post("/api/v1/workspaces").send({ name });
  return res.body.id as string;
}

export async function makeProduct(
  ownerToken: string,
  workspaceId: string,
  overrides: { name?: string; sku?: string; price?: number; initialQuantity?: number } = {},
) {
  const res = await authed(ownerToken)
    .post(`/api/v1/workspaces/${workspaceId}/products`)
    .send({
      name: overrides.name ?? "Test Product",
      sku: overrides.sku ?? `SKU-${Math.random().toString(36).slice(2, 10)}`,
      price: overrides.price ?? 10,
      initialQuantity: overrides.initialQuantity ?? 0,
    });
  return res.body as { id: string };
}
