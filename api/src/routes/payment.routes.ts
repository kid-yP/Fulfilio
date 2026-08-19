import { Router } from "express";
import express from "express";
import * as paymentController from "../controllers/payment.controller";

export const paymentWebhookRouter = Router();

// express.raw() is scoped to just this route — the rest of the app still
// uses express.json() globally (wired in app.ts). This route MUST be
// registered before the global json() middleware runs, or Express will have
// already consumed/parsed the body by the time this handler sees it.
paymentWebhookRouter.post("/webhook", express.raw({ type: "application/json" }), paymentController.handleStripeWebhook);
