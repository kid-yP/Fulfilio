import { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis";
import { AppError } from "./errorHandler";

// Fixed-window limiter backed by Redis — deliberately simple (no sliding window,
// no external library) so the mechanism is easy to explain in an interview.
// Good enough for protecting auth endpoints from brute-force / credential stuffing.
export function rateLimit({ windowSeconds, max }: { windowSeconds: number; max: number }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Disable rate limiting entirely in test environment so tests do not hit 429s
    if (process.env.NODE_ENV === "test") {
      return next();
    }

    const key = `ratelimit:${req.ip}:${req.baseUrl}${req.path}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (count > max) {
        return next(new AppError(429, "Too many requests — please try again shortly"));
      }
      next();
    } catch (err) {
      // If Redis is briefly unavailable, fail open rather than blocking all traffic.
      next();
    }
  };
}