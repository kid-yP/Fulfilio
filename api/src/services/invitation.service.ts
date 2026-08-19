import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { generateOpaqueToken, hashToken } from "../utils/tokens";
import { invitationEmailQueue } from "../lib/queues";

const INVITATION_TTL_DAYS = 7;

export async function createInvitation(
  workspaceId: string,
  email: string,
  role: Role,
  invitedById: string,
) {
  // If a still-valid, unaccepted invitation already exists for this email in
  // this workspace, don't create a second one — just resend it. Avoids a pile
  // of dead Invitation rows from someone clicking "invite" twice.
  const existing = await prisma.invitation.findFirst({
    where: { workspaceId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existing) {
    // Note: we don't have the original plaintext token (only its hash), so a
    // resend issues a fresh token and invalidates the old one.
    return reissueInvitation(existing.id);
  }

  const token = generateOpaqueToken();
  const invitation = await prisma.invitation.create({
    data: {
      workspaceId,
      email,
      role,
      tokenHash: hashToken(token),
      invitedById,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await invitationEmailQueue.add("send-invite", { email, token, workspaceId, role });

  return invitation;
}

async function reissueInvitation(invitationId: string) {
  const token = generateOpaqueToken();
  const invitation = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await invitationEmailQueue.add("send-invite", {
    email: invitation.email,
    token,
    workspaceId: invitation.workspaceId,
    role: invitation.role,
  });

  return invitation;
}

// The invitee must be authenticated (so we know their verified email) before
// accepting — this is what stops someone from guessing/forwarding a token to
// join a workspace under an email that isn't theirs.
export async function acceptInvitation(token: string, userId: string, userEmail: string) {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!invitation) throw new AppError(404, "Invitation not found or already used");
  if (invitation.acceptedAt) throw new AppError(409, "This invitation has already been accepted");
  if (invitation.expiresAt < new Date()) throw new AppError(410, "This invitation has expired");
  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new AppError(403, "This invitation was sent to a different email address");
  }

  const [, , membership] = await prisma.$transaction([
    prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    prisma.workspaceMember.deleteMany({
      where: { userId, workspaceId: invitation.workspaceId }, // no-op unless a stale row exists
    }),
    prisma.workspaceMember.create({
      data: { userId, workspaceId: invitation.workspaceId, role: invitation.role },
    }),
  ]);

  return membership;
}
