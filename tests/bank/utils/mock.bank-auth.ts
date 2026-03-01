import { TEST_BANK_ACCOUNT_ID } from "./data";

export const mockBankAuth = {
  requireBankAuth: vi.fn(),
  rejectApiToken: vi.fn(),
  generateToken: vi.fn(),
  generateApiToken: vi.fn(),
  verifyToken: vi.fn(),
  setup: () => {
    mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
      req.bankUser = { accountId: TEST_BANK_ACCOUNT_ID, tokenType: "session" };
      next();
    });
    mockBankAuth.rejectApiToken.mockImplementation((_req: any, _res: any, next: any) => {
      next();
    });
    mockBankAuth.generateToken.mockResolvedValue("mock-bank-jwt-token");
    mockBankAuth.generateApiToken.mockResolvedValue("mock-bank-api-token");
    mockBankAuth.verifyToken.mockResolvedValue({ accountId: TEST_BANK_ACCOUNT_ID, tokenType: "session" });
  },
  reset: () => {
    mockBankAuth.requireBankAuth.mockReset();
    mockBankAuth.rejectApiToken.mockReset();
    mockBankAuth.generateToken.mockReset();
    mockBankAuth.generateApiToken.mockReset();
    mockBankAuth.verifyToken.mockReset();
  },
};
