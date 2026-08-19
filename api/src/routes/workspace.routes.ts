import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requireWorkspaceMember, requireRole } from "../middleware/rbac.middleware";
import * as workspaceController from "../controllers/workspace.controller";

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

// Not workspace-scoped yet — no :workspaceId in the URL, so no membership check needed.
workspaceRouter.post("/", workspaceController.createWorkspace);
workspaceRouter.get("/", workspaceController.listMyWorkspaces);

// Everything below requires proven membership in :workspaceId first.
workspaceRouter.get("/:workspaceId", requireWorkspaceMember, workspaceController.getWorkspace);
workspaceRouter.get(
  "/:workspaceId/members",
  requireWorkspaceMember,
  workspaceController.listMembers,
);
workspaceRouter.post(
  "/:workspaceId/invite",
  requireWorkspaceMember,
  requireRole(Role.OWNER, Role.MANAGER),
  workspaceController.inviteMember,
);
workspaceRouter.patch(
  "/:workspaceId/members/:userId",
  requireWorkspaceMember,
  requireRole(Role.OWNER),
  workspaceController.changeMemberRole,
);
workspaceRouter.delete(
  "/:workspaceId/members/:userId",
  requireWorkspaceMember,
  requireRole(Role.OWNER),
  workspaceController.removeMember,
);
