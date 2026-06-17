import { extractBearerToken } from "@common/utils/auth-header.js";
import { verifyMfaToken } from "@token/services/mfa-token.service.js";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getAuth } from "firebase-admin/auth";

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  mfaVerified: boolean;
  kycStatus: string;
  authTime: number;
}

export interface AuthEnv {
  Variables: {
    user: AuthUser;
  };
}

export function getProjectAuth() {
  return getAuth();
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const sessionToken = extractBearerToken(c.req.header("authorization"));

  if (!sessionToken) {
    throw new HTTPException(401, { message: "Missing session token" });
  }

  let decoded;
  try {
    decoded = await getProjectAuth().verifySessionCookie(sessionToken, true);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired session" });
  }

  if (!decoded.email || !decoded.email_verified) {
    throw new HTTPException(401, { message: "Invalid or expired session" });
  }

  const name = typeof decoded.name === "string" ? decoded.name : decoded.email;
  const kycStatus = typeof decoded.kycStatus === "string" ? decoded.kycStatus : "none";
  c.set("user", {
    uid: decoded.uid,
    email: decoded.email,
    name,
    mfaVerified: !!decoded.firebase.sign_in_second_factor,
    kycStatus,
    authTime: decoded.auth_time,
  });
  await next();
});

export const requireKyc = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get("user").kycStatus !== "approved") {
    throw new HTTPException(403, { message: "KYC required" });
  }
  await next();
});

export const requireMfa = createMiddleware<AuthEnv>(async (c, next) => {
  if (!c.get("user").mfaVerified) {
    throw new HTTPException(403, { message: "MFA required" });
  }
  await next();
});

export const requireOperationMfa = createMiddleware<AuthEnv>(async (c, next) => {
  const token = c.req.header("x-mfa-token");
  if (!token) {
    throw new HTTPException(403, { message: "MFA verification required" });
  }

  try {
    verifyMfaToken(token, c.get("user").uid);
  } catch {
    throw new HTTPException(403, { message: "MFA verification required" });
  }
  await next();
});
