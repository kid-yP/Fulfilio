import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as invitationService from "../services/invitation.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export const acceptInvitation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const membership = await invitationService.acceptInvitation(
    req.params.token,
    req.user!.id,
    req.user!.email,
  );
  res.status(200).json(membership);
});
