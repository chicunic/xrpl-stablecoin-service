import { createHmac, timingSafeEqual } from "node:crypto";

const MFA_TOKEN_TTL = 300; // 5 minutes

export function getMfaSecret(): string {
  const secret = process.env.MFA_TOKEN_SECRET;
  if (!secret) {
    throw new Error("MFA_TOKEN_SECRET is not configured");
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

export function generateMfaToken(uid: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "MFA" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      uid,
      iat: now,
      exp: now + MFA_TOKEN_TTL,
    }),
  );
  const signature = sign(`${header}.${payload}`, getMfaSecret());
  return `${header}.${payload}.${signature}`;
}

export function verifyMfaToken(token: string, expectedUid: string): void {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid MFA token format");
  }

  const [header, payload, signature] = parts as [string, string, string];
  const expectedSignature = sign(`${header}.${payload}`, getMfaSecret());

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error("Invalid MFA token signature");
  }

  const decoded = JSON.parse(base64UrlDecode(payload)) as {
    uid: string;
    exp: number;
  };

  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("MFA token expired");
  }

  if (decoded.uid !== expectedUid) {
    throw new Error("MFA token uid mismatch");
  }
}
