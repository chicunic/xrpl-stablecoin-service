import { verifyMfaToken } from "@token/services/mfa-token.service.js";
import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email: string;
    name: string;
    mfaVerified: boolean;
    kycStatus: string;
    authTime: number;
  };
}

export function getProjectAuth() {
  return getAuth();
}

export function requireKyc(req: Request, res: Response, next: NextFunction): void {
  const { kycStatus } = (req as AuthenticatedRequest).user;
  if (kycStatus !== "approved") {
    res.status(403).json({ error: "KYC required" });
    return;
  }
  next();
}

export function requireMfa(req: Request, res: Response, next: NextFunction): void {
  const { mfaVerified } = (req as AuthenticatedRequest).user;
  if (!mfaVerified) {
    res.status(403).json({ error: "MFA required" });
    return;
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const sessionToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!sessionToken) {
    res.status(401).json({ error: "Missing session token" });
    return;
  }

  try {
    const decoded = await getProjectAuth().verifySessionCookie(sessionToken, true);
    if (!decoded.email || !decoded.email_verified) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    (req as AuthenticatedRequest).user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name ?? decoded.email,
      mfaVerified: !!decoded.firebase?.sign_in_second_factor,
      kycStatus: (decoded.kycStatus as string) ?? "none",
      authTime: (decoded.auth_time as number) ?? 0,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

export async function requireOperationMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers["x-mfa-token"] as string | undefined;
  if (!token) {
    res.status(403).json({ error: "MFA verification required", code: "MFA_REQUIRED" });
    return;
  }

  try {
    const { uid } = (req as AuthenticatedRequest).user;
    await verifyMfaToken(token, uid);
    next();
  } catch {
    res.status(403).json({ error: "MFA verification required", code: "MFA_REQUIRED" });
  }
}
