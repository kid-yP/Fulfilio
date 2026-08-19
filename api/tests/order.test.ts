import { authed, registerUser, makeWorkspace, makeProduct } from "./helpers";
import { resetDatabase } from "./setup";

jest.mock("../src/lib/queues", () => ({
  invitationEmailQueue: { add: jest.fn() },
  orderReservationExpiryQueue: { add: jest.fn() },
  orderConfirmationEmailQueue: { add: jest.fn() },
  invoiceGenerationQueue: { add: jest.fn() },
  lowStockAlertQueue: { add: jest.fn() },
}));

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

describe("Order creation & stock reservation", () => {
  it("reserves stock on creation without touching quantity", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 20 });

    const res = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        items: [{ productId: product.id, quantity: 3 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");

    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${product.id}`);
    expect(inv.body.quantity).toBe(20);
    expect(inv.body.reserved).toBe(3);
  });

  it("rejects an order for more stock than is available, without reserving anything", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 2 });

    const res = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        items: [{ productId: product.id, quantity: 5 }],
      });
    expect(res.status).toBe(409);

    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${product.id}`);
    expect(inv.body.reserved).toBe(0);
  });

  it("rolls back ALL reservations in the order if any single item is out of stock", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const plentiful = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 100 });
    const scarce = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 1 });

    const res = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        items: [
          { productId: plentiful.id, quantity: 10 },
          { productId: scarce.id, quantity: 5 }, // fails — only 1 available
        ],
      });
    expect(res.status).toBe(409);

    // The plentiful product must NOT have picked up a partial reservation.
    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${plentiful.id}`);
    expect(inv.body.reserved).toBe(0);
  });

  it("PROOF: two concurrent orders for the last unit — exactly one succeeds", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 1 });

    const orderPayload = {
      customerName: "Race Condition",
      customerEmail: "race@example.com",
      items: [{ productId: product.id, quantity: 1 }],
    };

    const [resA, resB] = await Promise.all([
      authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/orders`).send(orderPayload),
      authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/orders`).send(orderPayload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${product.id}`);
    expect(inv.body.reserved).toBe(1); // not 2 — the losing request never reserved anything
  });

  it("PROOF: idempotency key replay returns the same order without double-reserving stock", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 5 });

    const payload = {
      customerName: "Double Click",
      customerEmail: "click@example.com",
      items: [{ productId: product.id, quantity: 2 }],
    };

    const first = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .set("Idempotency-Key", "same-key-123")
      .send(payload);
    expect(first.status).toBe(201);

    const second = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .set("Idempotency-Key", "same-key-123")
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id); // same order returned, not a new one

    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${product.id}`);
    expect(inv.body.reserved).toBe(2); // reserved once, not twice
  });
});

describe("Order status transitions", () => {
  async function createPendingOrder(ownerToken: string, workspaceId: string, quantity = 5) {
    const product = await makeProduct(ownerToken, workspaceId, { initialQuantity: 10 });
    const res = await authed(ownerToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({ customerName: "X", customerEmail: "x@example.com", items: [{ productId: product.id, quantity }] });
    return { order: res.body, product };
  }

  it("allows PENDING -> PAID but rejects PENDING -> DELIVERED", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const { order } = await createPendingOrder(owner.accessToken, workspaceId);

    const badJump = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/orders/${order.id}/status`)
      .send({ status: "DELIVERED" });
    expect(badJump.status).toBe(400);

    const validStep = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/orders/${order.id}/status`)
      .send({ status: "PAID" });
    expect(validStep.status).toBe(200);
    expect(validStep.body.paidAt).toBeTruthy();
  });

  it("releases reserved stock when an order is cancelled", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const { order, product } = await createPendingOrder(owner.accessToken, workspaceId, 4);

    const cancelled = await authed(owner.accessToken).post(
      `/api/v1/workspaces/${workspaceId}/orders/${order.id}/cancel`,
    );
    expect(cancelled.status).toBe(200);

    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${product.id}`);
    expect(inv.body.reserved).toBe(0);
  });
});

describe("Order assignment", () => {
  it("assigns an order to a workspace member and rejects a non-member id", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const { order } = await (async () => {
      const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 10 });
      const res = await authed(owner.accessToken)
        .post(`/api/v1/workspaces/${workspaceId}/orders`)
        .send({ customerName: "X", customerEmail: "x@example.com", items: [{ productId: product.id, quantity: 1 }] });
      return { order: res.body };
    })();

    const rejectNonMember = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/orders/${order.id}/assignment`)
      .send({ assignedToId: "00000000-0000-0000-0000-000000000000" });
    expect(rejectNonMember.status).toBe(400);

    const ownerDetail = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/members`);
    const ownerMembership = ownerDetail.body[0];

    const assignRes = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/orders/${order.id}/assignment`)
      .send({ assignedToId: ownerMembership.userId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.assignedToId).toBe(ownerMembership.userId);
  });
});

describe("Auth isolation", () => {
  it("returns 404 for an order that belongs to a different workspace", async () => {
    const ownerA = await registerUser();
    const ownerB = await registerUser();
    const workspaceA = await makeWorkspace(ownerA.accessToken, "A");
    const workspaceB = await makeWorkspace(ownerB.accessToken, "B");
    const product = await makeProduct(ownerA.accessToken, workspaceA, { initialQuantity: 5 });

    const created = await authed(ownerA.accessToken)
      .post(`/api/v1/workspaces/${workspaceA}/orders`)
      .send({ customerName: "X", customerEmail: "x@example.com", items: [{ productId: product.id, quantity: 1 }] });

    const res = await authed(ownerB.accessToken).get(`/api/v1/workspaces/${workspaceB}/orders/${created.body.id}`);
    expect(res.status).toBe(404);
  });
});
