const BANK_SERVICE_URL = process.env.BANK_SERVICE_URL;

export function getBankServiceUrl(): string {
  if (!BANK_SERVICE_URL) {
    throw new Error("BANK_SERVICE_URL is not configured");
  }
  return BANK_SERVICE_URL;
}

export function getBankAuthToken(): string {
  const token = process.env.BANK_AUTH_TOKEN;
  if (!token) {
    throw new Error("BANK_AUTH_TOKEN is not configured");
  }
  return token;
}
