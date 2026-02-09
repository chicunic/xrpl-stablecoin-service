import { createJestMock, createSimpleModuleMock } from "../../utils/mock.factory";
import { TEST_BANK_ACCOUNT_ID, TEST_BANK_JWT_SECRET } from "./data";

process.env.BANK_JWT_SECRET = TEST_BANK_JWT_SECRET;

const mockBankAuthModule = {
  requireBankAuth: createJestMock(),
  rejectApiToken: createJestMock(),
  generateToken: createJestMock(),
  generateApiToken: createJestMock(),
  verifyToken: createJestMock(),
};

export const mockBankAuth = {
  requireBankAuth: mockBankAuthModule.requireBankAuth,
  rejectApiToken: mockBankAuthModule.rejectApiToken,
  generateToken: mockBankAuthModule.generateToken,
  generateApiToken: mockBankAuthModule.generateApiToken,
  verifyToken: mockBankAuthModule.verifyToken,
  setup: () => {
    mockBankAuthModule.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
      req.bankUser = { accountId: TEST_BANK_ACCOUNT_ID, tokenType: "session" };
      next();
    });
    mockBankAuthModule.rejectApiToken.mockImplementation((_req: any, _res: any, next: any) => {
      next();
    });
    mockBankAuthModule.generateToken.mockReturnValue("mock-bank-jwt-token");
    mockBankAuthModule.generateApiToken.mockReturnValue("mock-bank-api-token");
    mockBankAuthModule.verifyToken.mockReturnValue({ accountId: TEST_BANK_ACCOUNT_ID, tokenType: "session" });
  },
  reset: () => {
    mockBankAuthModule.requireBankAuth.mockReset();
    mockBankAuthModule.rejectApiToken.mockReset();
    mockBankAuthModule.generateToken.mockReset();
    mockBankAuthModule.generateApiToken.mockReset();
    mockBankAuthModule.verifyToken.mockReset();
  },
};

createSimpleModuleMock("../../src/bank/middleware/bank-auth", {
  requireBankAuth: mockBankAuthModule.requireBankAuth,
  rejectApiToken: mockBankAuthModule.rejectApiToken,
  generateToken: mockBankAuthModule.generateToken,
  generateApiToken: mockBankAuthModule.generateApiToken,
  verifyToken: mockBankAuthModule.verifyToken,
});
