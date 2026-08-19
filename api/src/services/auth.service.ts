import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from "../utils/tokens";

const SALT_ROUNDS = 12;

export async function registerUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return issueTokenPair(user.id, user.email);
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, "Invalid email or password");

  return issueTokenPair(user.id, user.email);
}

async function issueTokenPair(userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email });

  const refreshToken = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  });

  return { accessToken, refreshToken };
}

// Rotation with reuse detection:
// - A refresh token can only be used once.
// - If a token that's already marked `revoked` is presented again, that's a strong
//   signal it was stolen (attacker used it after the legitimate user already rotated
//   past it) — so we revoke the ENTIRE token family for that user as a precaution.
export async function refreshTokens(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record) throw new AppError(401, "Invalid refresh token");

  if (record.revoked) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    throw new AppError(401, "Refresh token reuse detected — all sessions revoked");
  }

  if (record.expiresAt < new Date()) {
    throw new AppError(401, "Refresh token expired");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) throw new AppError(401, "Invalid refresh token");

  const newRefreshToken = generateOpaqueToken();
  const newRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  });

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revoked: true, revokedAt: new Date(), replacedByToken: newRecord.id },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  return { accessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
}

export { verifyAccessToken };
