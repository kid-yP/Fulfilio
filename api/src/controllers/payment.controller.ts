import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import * as paymentService from "../services/payment.service";

export const handleStripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") throw new AppError(400, "Missing Stripe-Signature header");

  // req.body is a Buffer here because this route is mounted with express.raw()
  // instead of express.json() — Stripe's signature check requires the exact
  // raw bytes Stripe sent, not a re-serialized JSON object.
  const result = await paymentService.handleWebhookEvent(req.body as Buffer, signature);
  res.status(200).json(result);
});
