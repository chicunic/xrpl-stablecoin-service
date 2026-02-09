import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type TokenType = "session" | "api";

export interface BankAuthenticatedRequest extends Request {
  bankUser: {
    accountId: string;
    tokenType: TokenType;
  };
}

function getJwtSecret(): string {
  const secret = process.env.BANK_JWT_SECRET;
  if (!secret) {
    throw new Error("BANK_JWT_SECRET environment variable is required");
  }
  return secret;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function generateToken(accountId: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      accountId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    }),
  );
  const signature = sign(`${header}.${payload}`, getJwtSecret());
  return `${header}.${payload}.${signature}`;
}

export function generateApiToken(accountId: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      accountId,
      type: "api",
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const signature = sign(`${header}.${payload}`, getJwtSecret());
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): { accountId: string; tokenType: TokenType } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [header, payload, signature] = parts as [string, string, string];
  const expectedSignature = sign(`${header}.${payload}`, getJwtSecret());

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature");
  }

  const decoded = JSON.parse(base64UrlDecode(payload)) as {
    accountId: string;
    type?: string;
    exp?: number;
  };

  if (decoded.exp !== undefined && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return { accountId: decoded.accountId, tokenType: decoded.type === "api" ? "api" : "session" };
}

export async function requireBankAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = (req.cookies as Record<string, string | undefined>)?.__session;
  }

  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const decoded = verifyToken(token);
    (req as BankAuthenticatedRequest).bankUser = {
      accountId: decoded.accountId,
      tokenType: decoded.tokenType,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function rejectApiToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { tokenType } = (req as BankAuthenticatedRequest).bankUser;
  if (tokenType === "api") {
    res.status(403).json({ error: "API tokens are not allowed for this endpoint" });
    return;
  }
  next();
}
