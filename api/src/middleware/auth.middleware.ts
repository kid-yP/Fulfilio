import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";
import { verifyAccessToken } from "../services/auth.service";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

// Populates req.user from a valid Bearer access token. This runs on every
// protected route — workspace/role checks happen separately in rbac.middleware.ts
// so the two concerns (who are you / what are you allowed to do here) stay separate.
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or malformed Authorization header"));
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired access token"));
  }
}
