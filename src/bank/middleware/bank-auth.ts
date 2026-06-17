import { createHmac, timingSafeEqual } from "node:crypto";
import { extractBearerToken } from "@common/utils/auth-header.js";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

export type TokenType = "session" | "api";

export interface BankUser {
  accountId: string;
  tokenType: TokenType;
}

export interface BankEnv {
  Variables: {
    bankUser: BankUser;
  };
}

function getJwtSecret(): string {
  const secret = process.env.BANK_JWT_SECRET;
  if (!secret) {
    throw new Error("BANK_JWT_SECRET is not configured");
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

export const requireBankAuth = createMiddleware<BankEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header("authorization"));

  if (!token) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  try {
    c.set("bankUser", verifyToken(token));
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  await next();
});

export const rejectApiToken = createMiddleware<BankEnv>(async (c, next) => {
  if (c.get("bankUser").tokenType === "api") {
    throw new HTTPException(403, { message: "API tokens are not allowed for this endpoint" });
  }
  await next();
});
