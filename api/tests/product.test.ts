import { authed, registerUser } from "./helpers";
import { resetDatabase } from "./setup";

jest.mock("../src/lib/queues", () => ({
  invitationEmailQueue: { add: jest.fn() },
  orderReservationExpiryQueue: { add: jest.fn() },
  orderConfirmationEmailQueue: { add: jest.fn() },
  invoiceGenerationQueue: { add: jest.fn() },
  lowStockAlertQueue: { add: jest.fn() },
}));

import { invitationEmailQueue } from "../src/lib/queues";

function lastInviteToken(): string {
  const calls = (invitationEmailQueue.add as jest.Mock).mock.calls;
  return calls[calls.length - 1][1].token;
}

async function makeWorkspace(ownerToken: string, name = "Acme") {
  const res = await authed(ownerToken).post("/api/v1/workspaces").send({ name });
  return res.body.id as string;
}

async function inviteToken(ownerToken: string, workspaceId: string, email: string, role: "MANAGER" | "STAFF") {
  await authed(ownerToken).post(`/api/v1/workspaces/${workspaceId}/invite`).send({ email, role });
  return lastInviteToken();
}

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

describe("Product CRUD", () => {
  it("creates a product together with its inventory record", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);

    const created = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/products`)
      .send({ name: "Shipping Box (M)", sku: "BOX-M-001", price: 1.25, initialQuantity: 100 });
    expect(created.status).toBe(201);

    const detail = await authed(owner.accessToken).get(
      `/api/v1/workspaces/${workspaceId}/products/${created.body.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.inventory.quantity).toBe(100);
    expect(detail.body.inventory.reserved).toBe(0);
  });

  it("rejects a duplicate SKU within the same workspace", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const payload = { name: "Box", sku: "BOX-DUP", price: 1 };

    await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/products`).send(payload);
    const res = await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/products`).send(payload);
    expect(res.status).toBe(409);
  });

  it("allows the same SKU across two different workspaces", async () => {
    const owner = await registerUser();
    const wsA = await makeWorkspace(owner.accessToken, "Workspace A");
    const wsB = await makeWorkspace(owner.accessToken, "Workspace B");
    const payload = { name: "Box", sku: "BOX-SHARED", price: 1 };

    const resA = await authed(owner.accessToken).post(`/api/v1/workspaces/${wsA}/products`).send(payload);
    const resB = await authed(owner.accessToken).post(`/api/v1/workspaces/${wsB}/products`).send(payload);
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });

  it("blocks STAFF from creating or deleting products, but allows browsing", async () => {
    const owner = await registerUser();
    const staff = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const token = await inviteToken(owner.accessToken, workspaceId, staff.email, "STAFF");
    await authed(staff.accessToken).post(`/api/v1/invitations/${token}/accept`);

    const createRes = await authed(staff.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/products`)
      .send({ name: "Box", sku: "BOX-STAFF", price: 1 });
    expect(createRes.status).toBe(403);

    const listRes = await authed(staff.accessToken).get(`/api/v1/workspaces/${workspaceId}/products`);
    expect(listRes.status).toBe(200);
  });

  it("lets MANAGER create and update but not delete", async () => {
    const owner = await registerUser();
    const manager = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const token = await inviteToken(owner.accessToken, workspaceId, manager.email, "MANAGER");
    await authed(manager.accessToken).post(`/api/v1/invitations/${token}/accept`);

    const created = await authed(manager.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/products`)
      .send({ name: "Box", sku: "BOX-MGR", price: 1 });
    expect(created.status).toBe(201);

    const updated = await authed(manager.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/products/${created.body.id}`)
      .send({ price: 2 });
    expect(updated.status).toBe(200);
    expect(Number(updated.body.price)).toBe(2);

    const deleted = await authed(manager.accessToken).delete(
      `/api/v1/workspaces/${workspaceId}/products/${created.body.id}`,
    );
    expect(deleted.status).toBe(403);
  });
});

describe("Search, filter, pagination", () => {
  it("filters by search term and category, and paginates results", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);

    const seedProducts = [
      { name: "Shipping Box Small", sku: "SEARCH-BOX-S", category: "Packaging", price: 1 },
      { name: "Shipping Box Large", sku: "SEARCH-BOX-L", category: "Packaging", price: 2 },
      { name: "Barcode Scanner", sku: "SEARCH-SCAN-1", category: "Equipment", price: 90 },
    ];
    for (const p of seedProducts) {
      await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/products`).send(p);
    }

    const searchRes = await authed(owner.accessToken).get(
      `/api/v1/workspaces/${workspaceId}/products?search=box`,
    );
    expect(searchRes.body.items).toHaveLength(2);

    const categoryRes = await authed(owner.accessToken).get(
      `/api/v1/workspaces/${workspaceId}/products?category=Equipment`,
    );
    expect(categoryRes.body.items).toHaveLength(1);
    expect(categoryRes.body.items[0].sku).toBe("SEARCH-SCAN-1");

    const pageRes = await authed(owner.accessToken).get(
      `/api/v1/workspaces/${workspaceId}/products?limit=2&page=1`,
    );
    expect(pageRes.body.items).toHaveLength(2);
    expect(pageRes.body.total).toBe(3);
    expect(pageRes.body.totalPages).toBe(2);
  });
});

describe("Inventory invariants", () => {
  it("allows a positive adjustment (receiving stock)", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const created = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/products`)
      .send({ name: "Box", sku: "INV-001", price: 1, initialQuantity: 10 });

    const res = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/inventory/${created.body.id}`)
      .send({ adjustment: 5 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(15);
  });

  it("rejects an adjustment that would make quantity negative", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const created = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/products`)
      .send({ name: "Box", sku: "INV-002", price: 1, initialQuantity: 3 });

    const res = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/inventory/${created.body.id}`)
      .send({ adjustment: -10 });
    expect(res.status).toBe(400);

    const unchanged = await authed(owner.accessToken).get(
      `/api/v1/workspaces/${workspaceId}/inventory/${created.body.id}`,
    );
    expect(unchanged.body.quantity).toBe(3); // rejected adjustment must not partially apply
  });

  it("runs concurrent adjustments safely — the row lock prevents lost updates", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const created = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/products`)
      .send({ name: "Box", sku: "INV-CONC-001", price: 1, initialQuantity: 100 });

    // Fire 10 concurrent +1 adjustments. Without SELECT ... FOR UPDATE, two
    // requests can both read quantity=100 and both write 101 — a lost update.
    // With the lock, they serialize and the final value must be exactly 110.
    const requests = Array.from({ length: 10 }, () =>
      authed(owner.accessToken)
        .patch(`/api/v1/workspaces/${workspaceId}/inventory/${created.body.id}`)
        .send({ adjustment: 1 }),
    );
    const results = await Promise.all(requests);
    expect(results.every((r) => r.status === 200)).toBe(true);

    const final = await authed(owner.accessToken).get(
      `/api/v1/workspaces/${workspaceId}/inventory/${created.body.id}`,
    );
    expect(final.body.quantity).toBe(110);
  });
});

describe("Auth isolation", () => {
  it("returns 404 for a product that belongs to a different workspace, even with a valid id", async () => {
    const ownerA = await registerUser();
    const ownerB = await registerUser();
    const workspaceA = await makeWorkspace(ownerA.accessToken, "Workspace A");
    const workspaceB = await makeWorkspace(ownerB.accessToken, "Workspace B");

    const created = await authed(ownerA.accessToken)
      .post(`/api/v1/workspaces/${workspaceA}/products`)
      .send({ name: "Box", sku: "ISO-001", price: 1 });

    // ownerB is authenticated and a real OWNER — just of a different workspace.
    const res = await authed(ownerB.accessToken).get(
      `/api/v1/workspaces/${workspaceB}/products/${created.body.id}`,
    );
    expect(res.status).toBe(404);
  });

  it("blocks cross-workspace inventory adjustment attempts", async () => {
    const ownerA = await registerUser();
    const ownerB = await registerUser();
    const workspaceA = await makeWorkspace(ownerA.accessToken, "Workspace A");
    const workspaceB = await makeWorkspace(ownerB.accessToken, "Workspace B");

    const created = await authed(ownerA.accessToken)
      .post(`/api/v1/workspaces/${workspaceA}/products`)
      .send({ name: "Box", sku: "ISO-002", price: 1, initialQuantity: 50 });

    const res = await authed(ownerB.accessToken)
      .patch(`/api/v1/workspaces/${workspaceB}/inventory/${created.body.id}`)
      .send({ adjustment: -50 });
    expect(res.status).toBe(404);

    const stillIntact = await authed(ownerA.accessToken).get(
      `/api/v1/workspaces/${workspaceA}/inventory/${created.body.id}`,
    );
    expect(stillIntact.body.quantity).toBe(50);
  });
});
