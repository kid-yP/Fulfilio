import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import * as authService from "../services/auth.service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);
  const tokens = await authService.registerUser(body.email, body.password, body.name);
  res.status(201).json(tokens);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const tokens = await authService.loginUser(body.email, body.password);
  res.status(200).json(tokens);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.parse(req.body);
  const tokens = await authService.refreshTokens(body.refreshToken);
  res.status(200).json(tokens);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.parse(req.body);
  await authService.logoutUser(body.refreshToken);
  res.status(204).send();
});
