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

export function getTenantAuth() {
  const tenantId = process.env.IDENTITY_PLATFORM_TENANT_ID;
  if (!tenantId) {
    throw new Error("IDENTITY_PLATFORM_TENANT_ID is not configured");
  }
  return getAuth().tenantManager().authForTenant(tenantId);
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

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await getTenantAuth().verifyIdToken(idToken);
    if (!decoded.email || !decoded.email_verified) {
      res.status(401).json({ error: "Invalid or expired token" });
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
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireOperationMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.cookies as Record<string, string | undefined>)?.__mfa_token;
  if (!token) {
    res.status(403).json({ error: "MFA verification required", code: "MFA_REQUIRED" });
    return;
  }

  try {
    const { uid } = (req as AuthenticatedRequest).user;
    await verifyMfaToken(token, uid);
    res.clearCookie("__mfa_token", { path: "/api/v1" });
    next();
  } catch {
    res.status(403).json({ error: "MFA verification required", code: "MFA_REQUIRED" });
  }
}
