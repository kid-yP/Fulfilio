import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/slugify";

export async function createWorkspace(name: string, ownerId: string) {
  const slug = slugify(name);

  // Creating the workspace and making the creator its OWNER must succeed or
  // fail together — an orphaned ownerless workspace is a broken state.
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({ data: { name, slug } });
    await tx.workspaceMember.create({
      data: { userId: ownerId, workspaceId: workspace.id, role: "OWNER" },
    });
    return workspace;
  });
}

export async function listMyWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
  });
  return memberships.map((m) => ({ ...m.workspace, myRole: m.role }));
}

export async function getWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new AppError(404, "Workspace not found");
  return workspace;
}

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
}

export async function changeMemberRole(workspaceId: string, targetUserId: string, newRole: Role) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });
  if (!membership) throw new AppError(404, "Member not found in this workspace");

  if (membership.role === "OWNER" && newRole !== "OWNER") {
    await assertNotLastOwner(workspaceId);
  }

  return prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    data: { role: newRole },
  });
}

export async function removeMember(workspaceId: string, targetUserId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });
  if (!membership) throw new AppError(404, "Member not found in this workspace");

  if (membership.role === "OWNER") {
    await assertNotLastOwner(workspaceId);
  }

  await prisma.workspaceMember.delete({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });
}

// A workspace with zero owners is unrecoverable (nobody left who can manage
// roles), so demoting/removing the last OWNER is blocked outright.
async function assertNotLastOwner(workspaceId: string) {
  const ownerCount = await prisma.workspaceMember.count({ where: { workspaceId, role: "OWNER" } });
  if (ownerCount <= 1) {
    throw new AppError(400, "A workspace must have at least one owner");
  }
}
