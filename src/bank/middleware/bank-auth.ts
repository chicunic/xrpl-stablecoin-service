import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type TokenType = "session" | "api";

export interface BankAuthenticatedRequest extends Request {
  bankUser: {
    accountId: string;
    tokenType: TokenType;
  };
}

const BANK_JWT_SECRET_PATH = process.env.BANK_JWT_SECRET_PATH;
let cachedJwtSecret: string | null = null;

async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  if (!BANK_JWT_SECRET_PATH) {
    throw new Error("BANK_JWT_SECRET_PATH is not configured");
  }

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const secretClient = new SecretManagerServiceClient();

  const [version] = await secretClient.accessSecretVersion({
    name: BANK_JWT_SECRET_PATH,
  });

  const payload = version.payload?.data;
  if (!payload) {
    throw new Error("Failed to retrieve BANK_JWT_SECRET from Secret Manager");
  }

  cachedJwtSecret = typeof payload === "string" ? payload : new TextDecoder().decode(payload as Uint8Array);
  return cachedJwtSecret;
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

export async function generateToken(accountId: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      accountId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    }),
  );
  const signature = sign(`${header}.${payload}`, await getJwtSecret());
  return `${header}.${payload}.${signature}`;
}

export async function generateApiToken(accountId: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      accountId,
      type: "api",
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const signature = sign(`${header}.${payload}`, await getJwtSecret());
  return `${header}.${payload}.${signature}`;
}

export async function verifyToken(token: string): Promise<{ accountId: string; tokenType: TokenType }> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [header, payload, signature] = parts as [string, string, string];
  const expectedSignature = sign(`${header}.${payload}`, await getJwtSecret());

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
  }

  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const decoded = await verifyToken(token);
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
