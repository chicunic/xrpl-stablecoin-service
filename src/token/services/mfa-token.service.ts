import { createHmac, timingSafeEqual } from "node:crypto";

const MFA_TOKEN_SECRET_PATH = process.env.MFA_TOKEN_SECRET_PATH;
const MFA_TOKEN_TTL = 300; // 5 minutes

let cachedMfaSecret: string | null = null;

export async function getMfaSecret(): Promise<string> {
  if (cachedMfaSecret) {
    return cachedMfaSecret;
  }

  if (!MFA_TOKEN_SECRET_PATH) {
    throw new Error("MFA_TOKEN_SECRET_PATH is not configured");
  }

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const secretClient = new SecretManagerServiceClient();

  const [version] = await secretClient.accessSecretVersion({
    name: MFA_TOKEN_SECRET_PATH,
  });

  const payload = version.payload?.data;
  if (!payload) {
    throw new Error("Failed to retrieve MFA_TOKEN_SECRET from Secret Manager");
  }

  cachedMfaSecret = typeof payload === "string" ? payload : new TextDecoder().decode(payload as Uint8Array);
  return cachedMfaSecret;
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

export async function generateMfaToken(uid: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "MFA" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      uid,
      iat: now,
      exp: now + MFA_TOKEN_TTL,
    }),
  );
  const signature = sign(`${header}.${payload}`, await getMfaSecret());
  return `${header}.${payload}.${signature}`;
}

export async function verifyMfaToken(token: string, expectedUid: string): Promise<void> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid MFA token format");
  }

  const [header, payload, signature] = parts as [string, string, string];
  const expectedSignature = sign(`${header}.${payload}`, await getMfaSecret());

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
