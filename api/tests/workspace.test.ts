import { authed, registerUser } from "./helpers";
import { resetDatabase } from "./setup";

// Mock the queue layer so tests don't need a live Redis connection and don't
// depend on the worker actually running — we only need to know the API
// enqueued the right job with the right data (in particular, the invite token).
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

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

describe("Workspace creation", () => {
  it("makes the creator OWNER", async () => {
    const owner = await registerUser();

    const created = await authed(owner.accessToken)
      .post("/api/v1/workspaces")
      .send({ name: "Acme Distribution" });
    expect(created.status).toBe(201);

    const detail = await authed(owner.accessToken).get(`/api/v1/workspaces/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.myRole).toBe("OWNER");
  });
});

describe("Invitation flow", () => {
  it("lets an OWNER invite someone, and the invitee can accept and becomes a member", async () => {
    const owner = await registerUser();
    const invitee = await registerUser();

    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    const invite = await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .send({ email: invitee.email, role: "STAFF" });
    expect(invite.status).toBe(201);
    expect(invitationEmailQueue.add).toHaveBeenCalledTimes(1);

    const token = lastInviteToken();
    expect(token).toBeTruthy();

    const accept = await authed(invitee.accessToken).post(`/api/v1/invitations/${token}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.role).toBe("STAFF");

    const members = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/members`);
    expect(members.body).toHaveLength(2);
  });

  it("rejects acceptance when the authenticated user's email doesn't match the invitation", async () => {
    const owner = await registerUser();
    const invitee = await registerUser();
    const impostor = await registerUser();

    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .send({ email: invitee.email, role: "STAFF" });

    const res = await authed(impostor.accessToken).post(`/api/v1/invitations/${lastInviteToken()}/accept`);
    expect(res.status).toBe(403);
  });

  it("rejects acceptance of an already-accepted invitation", async () => {
    const owner = await registerUser();
    const invitee = await registerUser();

    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .send({ email: invitee.email, role: "STAFF" });
    const token = lastInviteToken();

    const first = await authed(invitee.accessToken).post(`/api/v1/invitations/${token}/accept`);
    expect(first.status).toBe(200);

    const second = await authed(invitee.accessToken).post(`/api/v1/invitations/${token}/accept`);
    expect(second.status).toBe(409);
  });

  it("blocks STAFF from inviting new members (role enforcement)", async () => {
    const owner = await registerUser();
    const staff = await registerUser();

    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    await authed(owner.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .send({ email: staff.email, role: "STAFF" });
    await authed(staff.accessToken).post(`/api/v1/invitations/${lastInviteToken()}/accept`);

    const res = await authed(staff.accessToken)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .send({ email: "someone-else@test.dev", role: "STAFF" });
    expect(res.status).toBe(403);
  });
});

describe("Auth isolation", () => {
  it("returns 404 (not 403) for a workspace the user is not a member of", async () => {
    const owner = await registerUser();
    const outsider = await registerUser();

    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    // The key assertion: an outsider hitting a real, valid workspace ID gets
    // treated identically to a nonexistent one — no information leak.
    const res = await authed(outsider.accessToken).get(`/api/v1/workspaces/${workspaceId}`);
    expect(res.status).toBe(404);
  });

  it("blocks a workspace member's write actions on a workspace they don't belong to", async () => {
    const ownerA = await registerUser();
    const ownerB = await registerUser();

    const wsA = await authed(ownerA.accessToken).post("/api/v1/workspaces").send({ name: "Workspace A" });
    await authed(ownerB.accessToken).post("/api/v1/workspaces").send({ name: "Workspace B" });

    // ownerB is a real OWNER — just not of Workspace A. Confirms role checks
    // don't accidentally short-circuit before membership is verified.
    const res = await authed(ownerB.accessToken)
      .post(`/api/v1/workspaces/${wsA.body.id}/invite`)
      .send({ email: "target@test.dev", role: "STAFF" });
    expect(res.status).toBe(404);
  });
});

describe("Owner safety", () => {
  it("prevents removing the last owner of a workspace", async () => {
    const owner = await registerUser();
    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    const members = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/members`);
    const ownerMembership = members.body[0];

    const res = await authed(owner.accessToken).delete(
      `/api/v1/workspaces/${workspaceId}/members/${ownerMembership.userId}`,
    );
    expect(res.status).toBe(400);
  });

  it("prevents demoting the last owner via role change", async () => {
    const owner = await registerUser();
    const ws = await authed(owner.accessToken).post("/api/v1/workspaces").send({ name: "Acme" });
    const workspaceId = ws.body.id;

    const members = await authed(owner.accessToken).get(`/api/v1/workspaces/${workspaceId}/members`);
    const ownerMembership = members.body[0];

    const res = await authed(owner.accessToken)
      .patch(`/api/v1/workspaces/${workspaceId}/members/${ownerMembership.userId}`)
      .send({ role: "STAFF" });
    expect(res.status).toBe(400);
  });
});
