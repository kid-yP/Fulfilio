import { NextFunction, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "./errorHandler";
import { AuthenticatedRequest } from "./auth.middleware";

export interface WorkspaceScopedRequest extends AuthenticatedRequest {
  membership?: { workspaceId: string; role: Role };
}

// This is the single most important middleware in the app: it's what makes
// multi-tenancy real instead of decorative. Every workspace-scoped route reads
// :workspaceId from the URL, and this middleware proves the authenticated user
// actually belongs to that workspace BEFORE any controller touches the database.
// Without this, changing a workspaceId in the URL would let User A read/write
// User B's data — that's the exact failure the auth-isolation test checks for.
export function requireWorkspaceMember(
  req: WorkspaceScopedRequest,
  res: Response,
  next: NextFunction,
) {
  const workspaceId = req.params.workspaceId;
  const userId = req.user?.id;

  if (!userId) return next(new AppError(401, "Not authenticated"));
  if (!workspaceId) return next(new AppError(400, "Missing workspaceId"));

  prisma.workspaceMember
    .findUnique({ where: { userId_workspaceId: { userId, workspaceId } } })
    .then((membership) => {
      if (!membership) {
        // Deliberately 404, not 403 — don't confirm to an outsider that this
        // workspace exists at all.
        return next(new AppError(404, "Workspace not found"));
      }
      req.membership = { workspaceId, role: membership.role };
      next();
    })
    .catch(next);
}

// Use after requireWorkspaceMember. Example: requireRole("OWNER", "MANAGER")
export function requireRole(...allowed: Role[]) {
  return (req: WorkspaceScopedRequest, res: Response, next: NextFunction) => {
    if (!req.membership) return next(new AppError(500, "requireRole used without requireWorkspaceMember"));
    if (!allowed.includes(req.membership.role)) {
      return next(new AppError(403, "You do not have permission to perform this action"));
    }
    next();
  };
}
