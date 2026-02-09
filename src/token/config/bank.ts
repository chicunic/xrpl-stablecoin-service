const BANK_AUTH_TOKEN_SECRET_PATH = process.env.BANK_AUTH_TOKEN_SECRET_PATH;
const BANK_SERVICE_URL = process.env.BANK_SERVICE_URL;

let cachedBankAuthToken: string | null = null;

export function getBankServiceUrl(): string {
  if (!BANK_SERVICE_URL) {
    throw new Error("BANK_SERVICE_URL is not configured");
  }
  return BANK_SERVICE_URL;
}

export async function getBankAuthToken(): Promise<string> {
  if (cachedBankAuthToken) {
    return cachedBankAuthToken;
  }

  if (!BANK_AUTH_TOKEN_SECRET_PATH) {
    throw new Error("BANK_AUTH_TOKEN_SECRET_PATH is not configured");
  }

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const secretClient = new SecretManagerServiceClient();

  const [version] = await secretClient.accessSecretVersion({
    name: BANK_AUTH_TOKEN_SECRET_PATH,
  });

  const payload = version.payload?.data;
  if (!payload) {
    throw new Error("Failed to retrieve BANK_AUTH_TOKEN from Secret Manager");
  }

  cachedBankAuthToken = typeof payload === "string" ? payload : new TextDecoder().decode(payload as Uint8Array);
  return cachedBankAuthToken;
}
