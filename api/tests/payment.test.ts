import { authed, registerUser, makeWorkspace, makeProduct } from "./helpers";
import { resetDatabase } from "./setup";
import { app } from "./helpers";
import request from "supertest";

jest.mock("../src/lib/queues", () => ({
  invitationEmailQueue: { add: jest.fn() },
  orderReservationExpiryQueue: { add: jest.fn() },
  orderConfirmationEmailQueue: { add: jest.fn() },
  invoiceGenerationQueue: { add: jest.fn() },
  lowStockAlertQueue: { add: jest.fn() },
}));

// Mock the Stripe SDK entirely — no network call, no real signature check.
jest.mock("stripe", () => {
  const constructEventMock = jest.fn();
  const stripeMock = jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: "cs_test_mock", url: "https://stripe.test/checkout" }),
      },
    },
    webhooks: { constructEvent: constructEventMock },
  }));
  (stripeMock as any).__constructEventMock = constructEventMock;
  return stripeMock;
});

// Retrieve the mocked Stripe constructor to access constructEventMock
const stripeMocked = jest.requireMock("stripe") as unknown as {
  __constructEventMock: jest.Mock;
};
const constructEventMock = stripeMocked.__constructEventMock;

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

async function createPendingOrderWithPayment(ownerToken: string, workspaceId: string) {
  const product = await makeProduct(ownerToken, workspaceId, { initialQuantity: 5 });
  const orderRes = await authed(ownerToken)
    .post(`/api/v1/workspaces/${workspaceId}/orders`)
    .send({ customerName: "Jane", customerEmail: "jane@example.com", items: [{ productId: product.id, quantity: 1 }] });
  const orderId = orderRes.body.id as string;

  await request(app)
    .post(`/api/v1/workspaces/${workspaceId}/orders/${orderId}/checkout`)
    .set("Authorization", `Bearer ${ownerToken}`);

  return { orderId, product };
}

function stripeEvent(id: string, type: string, orderId: string, workspaceId: string) {
  return {
    id,
    type,
    data: {
      object: {
        id: `cs_test_${id}`,
        metadata: { orderId, workspaceId },
      },
    },
  };
}

describe("Stripe webhook", () => {
  it("rejects a request with an invalid signature", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("signature mismatch");
    });

    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Stripe-Signature", "bad-signature")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(400);
  });

  it("marks the order PAID on checkout.session.completed", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const { orderId } = await createPendingOrderWithPayment(owner.accessToken, workspaceId);

    constructEventMock.mockReturnValue(stripeEvent("evt_1", "checkout.session.completed", orderId, workspaceId));

    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Stripe-Signature", "valid")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(200);

    const order = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/orders/${orderId}`);
    expect(order.body.status).toBe("PAID");
    expect(order.body.payment.status).toBe("SUCCEEDED");
  });

  it("PROOF: replaying the same event id does not double-process the order", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const { orderId } = await createPendingOrderWithPayment(owner.accessToken, workspaceId);

    constructEventMock.mockReturnValue(stripeEvent("evt_dup", "checkout.session.completed", orderId, workspaceId));

    const first = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Stripe-Signature", "valid")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Stripe-Signature", "valid")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const order = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/orders/${orderId}`);
    expect(order.body.status).toBe("PAID");
  });

  it("releases reserved stock and marks the order FAILED on checkout.session.expired", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const { orderId, product } = await createPendingOrderWithPayment(owner.accessToken, workspaceId);

    constructEventMock.mockReturnValue(stripeEvent("evt_exp", "checkout.session.expired", orderId, workspaceId));

    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Stripe-Signature", "valid")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(200);

    const order = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/orders/${orderId}`);
    expect(order.body.status).toBe("FAILED");

    const inv = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/inventory/${product.id}`);
    expect(inv.body.reserved).toBe(0);
  });
});