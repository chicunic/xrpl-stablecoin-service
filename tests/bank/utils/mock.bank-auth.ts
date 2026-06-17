import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { TEST_BANK_ACCOUNT_ID } from "./data";

export const mockBankAuth = {
  requireBankAuth: vi.fn(),
  rejectApiToken: vi.fn(),
  generateToken: vi.fn(),
  generateApiToken: vi.fn(),
  verifyToken: vi.fn(),
  setup: () => {
    mockBankAuth.requireBankAuth.mockImplementation(async (c: Context, next: Next) => {
      c.set("bankUser", { accountId: TEST_BANK_ACCOUNT_ID, tokenType: "session" });
      await next();
    });
    mockBankAuth.rejectApiToken.mockImplementation(async (_c: Context, next: Next) => {
      await next();
    });
    mockBankAuth.generateToken.mockReturnValue("mock-bank-jwt-token");
    mockBankAuth.generateApiToken.mockReturnValue("mock-bank-api-token");
    mockBankAuth.verifyToken.mockReturnValue({ accountId: TEST_BANK_ACCOUNT_ID, tokenType: "session" });
  },
  reset: () => {
    mockBankAuth.requireBankAuth.mockReset();
    mockBankAuth.rejectApiToken.mockReset();
    mockBankAuth.generateToken.mockReset();
    mockBankAuth.generateApiToken.mockReset();
    mockBankAuth.verifyToken.mockReset();
  },
};

/** Hono middleware that rejects with a 401 — for per-test "no auth" overrides. */
export function bankAuthReject401(message = "Missing or invalid Authorization header") {
  return () => {
    throw new HTTPException(401, { message });
  };
}

/** Hono middleware that sets a specific bankUser — for per-test token-type overrides. */
export function bankAuthAs(accountId: string, tokenType: "session" | "api") {
  return async (c: Context, next: Next) => {
    c.set("bankUser", { accountId, tokenType });
    await next();
  };
}
