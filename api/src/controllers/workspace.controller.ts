import { Response } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import * as workspaceService from "../services/workspace.service";
import * as invitationService from "../services/invitation.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { WorkspaceScopedRequest } from "../middleware/rbac.middleware";

const createWorkspaceSchema = z.object({ name: z.string().min(1).max(120) });
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role).default(Role.STAFF),
});
const changeRoleSchema = z.object({ role: z.nativeEnum(Role) });

export const createWorkspace = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const body = createWorkspaceSchema.parse(req.body);
  const workspace = await workspaceService.createWorkspace(body.name, req.user!.id);
  res.status(201).json(workspace);
});

export const listMyWorkspaces = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const workspaces = await workspaceService.listMyWorkspaces(req.user!.id);
  res.status(200).json(workspaces);
});

export const getWorkspace = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const workspace = await workspaceService.getWorkspace(req.params.workspaceId);
  res.status(200).json({ ...workspace, myRole: req.membership!.role });
});

export const listMembers = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const members = await workspaceService.listMembers(req.params.workspaceId);
  res.status(200).json(members);
});

export const inviteMember = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = inviteSchema.parse(req.body);
  const invitation = await invitationService.createInvitation(
    req.params.workspaceId,
    body.email,
    body.role,
    req.user!.id,
  );
  // Never return the token itself here — it only goes out via the email job.
  res.status(201).json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  });
});

export const changeMemberRole = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  const body = changeRoleSchema.parse(req.body);
  const membership = await workspaceService.changeMemberRole(
    req.params.workspaceId,
    req.params.userId,
    body.role,
  );
  res.status(200).json(membership);
});

export const removeMember = asyncHandler(async (req: WorkspaceScopedRequest, res: Response) => {
  await workspaceService.removeMember(req.params.workspaceId, req.params.userId);
  res.status(204).send();
});
