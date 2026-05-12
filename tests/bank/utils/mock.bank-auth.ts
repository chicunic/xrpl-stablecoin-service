import type { NextFunction, Request, Response } from "express";
import { TEST_BANK_ACCOUNT_ID } from "./data";

export const mockBankAuth = {
  requireBankAuth: vi.fn(),
  rejectApiToken: vi.fn(),
  generateToken: vi.fn(),
  generateApiToken: vi.fn(),
  verifyToken: vi.fn(),
  setup: () => {
    mockBankAuth.requireBankAuth.mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { bankUser: { accountId: string; tokenType: string } }).bankUser = {
        accountId: TEST_BANK_ACCOUNT_ID,
        tokenType: "session",
      };
      next();
    });
    mockBankAuth.rejectApiToken.mockImplementation((_req: Request, _res: Response, next: NextFunction) => {
      next();
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
