import { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Consistent error shape across the whole API instead of leaking stack traces
// or ad-hoc { error: "..." } objects from every route.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { message: err.message },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: { message: "Internal server error" },
  });
}
