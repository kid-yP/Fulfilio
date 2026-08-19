import { authed, registerUser, makeWorkspace, makeProduct } from "./helpers";
import { resetDatabase } from "./setup";

jest.mock("../src/lib/queues", () => ({
  invitationEmailQueue: { add: jest.fn() },
  orderReservationExpiryQueue: { add: jest.fn() },
  orderConfirmationEmailQueue: { add: jest.fn() },
  invoiceGenerationQueue: { add: jest.fn() },
  lowStockAlertQueue: { add: jest.fn() },
}));

// Mocked defensively so these tests never make a real network call, whether
// or not the local .env happens to have a real ANTHROPIC_API_KEY set — the
// deterministic template fallback (used when no key is configured at all,
// the default per .env.example) is what CI actually exercises.
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ content: [{ type: "text", text: "Mocked AI summary." }] }),
    },
  }));
});

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

describe("AI daily summary", () => {
  it("reflects real operational data — low-stock count matches a seeded product", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);

    // Below its default threshold (5) — should surface in the summary stats.
    await makeProduct(owner.accessToken, workspaceId, { name: "Scarce Widget", initialQuantity: 2 });
    await makeProduct(owner.accessToken, workspaceId, { name: "Plentiful Widget", initialQuantity: 500 });

    const res = await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/ai/daily-summary`);
    expect(res.status).toBe(200);
    expect(res.body.stats.lowStockCount).toBe(1);
    expect(res.body.stats.lowStockProducts[0].name).toBe("Scarce Widget");
    expect(typeof res.body.summary).toBe("string");
    expect(res.body.summary.length).toBeGreaterThan(0);
  });

  it("counts orders created today", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 10 });

    await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({ customerName: "A", customerEmail: "a@example.com", items: [{ productId: product.id, quantity: 1 }] });
    await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({ customerName: "B", customerEmail: "b@example.com", items: [{ productId: product.id, quantity: 1 }] });

    const res = await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/ai/daily-summary`);
    expect(res.body.stats.ordersCreatedToday).toBe(2);
  });
});

describe("AI triage", () => {
  it("returns prioritized recommendations for open (PAID/PROCESSING) orders only", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);
    const product = await makeProduct(owner.accessToken, workspaceId, { initialQuantity: 10 });

    const created = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/orders`)
      .send({ customerName: "A", customerEmail: "a@example.com", items: [{ productId: product.id, quantity: 1 }] });
    // Still PENDING — should NOT appear in triage (only PAID/PROCESSING are open work).
    await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/orders/${created.body.id}/status`)
      .send({ status: "PAID" });

    const res = await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/ai/triage`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body.recommendations.every((r: { orderId: string }) => typeof r.orderId === "string")).toBe(true);
  });

  it("returns an empty list when there are no open orders", async () => {
    const owner = await registerUser();
    const workspaceId = await makeWorkspace(owner.accessToken);

    const res = await authed(owner.accessToken).post(`/api/v1/workspaces/${workspaceId}/ai/triage`);
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toEqual([]);
  });
});
