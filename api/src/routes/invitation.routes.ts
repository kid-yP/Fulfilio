import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import * as invitationController from "../controllers/invitation.controller";

export const invitationRouter = Router();

// Deliberately NOT workspace-scoped by URL — the token itself is the proof of
// authorization here, and requireWorkspaceMember doesn't apply since the user
// isn't a member yet (that's the whole point of accepting).
invitationRouter.post("/:token/accept", requireAuth, invitationController.acceptInvitation);
