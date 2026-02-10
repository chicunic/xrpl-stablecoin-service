import type express from "express";
import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

const mockGenerateMfaToken = jest.fn();

jest.mock("../../src/token/services/mfa-token.service", () => ({
  generateMfaToken: mockGenerateMfaToken,
  verifyMfaToken: jest.fn(),
}));

// Mock wallet.service to avoid real Secret Manager calls
jest.mock("../../src/token/services/wallet.service", () => ({
  deriveWallet: jest.fn().mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" }),
  getWalletForSigning: jest.fn().mockResolvedValue({ sign: jest.fn() }),
  allocateXrpAddressIndex: jest.fn().mockResolvedValue(1),
}));

jest.mock("../../src/token/services/faucet.service", () => ({
  fundAccount: jest.fn().mockResolvedValue({ balance: 1000 }),
}));

jest.mock("../../src/token/services/trustline.service", () => ({
  hasTrustLine: jest.fn().mockResolvedValue(false),
  setTrustLine: jest.fn().mockResolvedValue("mock-trustline-tx-hash"),
  ensureTrustLine: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: jest.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: jest.fn().mockResolvedValue("mock-bank-auth-token"),
}));

describe("MFA Routes - REST API Integration", () => {
  let app: express.Application;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockGenerateMfaToken.mockReset();
  });

  describe("POST /api/v1/mfa/verify", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.post("/api/v1/mfa/verify", {});

      restAssert.expectError(response, 401);
    });

    it("should return 403 if MFA not verified in ID token", async () => {
      mockIdentityPlatformAuth.setupWithoutMfa();

      const response = await helper.post(
        "/api/v1/mfa/verify",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectError(response, 403, "MFA not verified");
    });

    it("should return 403 if auth_time is too old", async () => {
      const oldAuthTime = Math.floor(Date.now() / 1000) - 60; // 60 seconds ago
      mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue({
        uid: "google-uid-123456",
        email: "test@example.com",
        name: "Test User",
        email_verified: true,
        auth_time: oldAuthTime,
        firebase: { sign_in_second_factor: "phone" },
        kycStatus: "approved",
      });

      const response = await helper.post(
        "/api/v1/mfa/verify",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectError(response, 403, "Authentication too old");
    });

    it("should return 200 and mfaToken in body on valid MFA verification", async () => {
      const recentAuthTime = Math.floor(Date.now() / 1000) - 5; // 5 seconds ago
      mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue({
        uid: "google-uid-123456",
        email: "test@example.com",
        name: "Test User",
        email_verified: true,
        auth_time: recentAuthTime,
        firebase: { sign_in_second_factor: "phone" },
        kycStatus: "approved",
      });
      mockGenerateMfaToken.mockResolvedValue("mock-mfa-token-value");

      const response = await helper.post(
        "/api/v1/mfa/verify",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectSuccess(response, 200);
      expect(response.body.status).toBe("ok");
      expect(response.body.mfaToken).toBe("mock-mfa-token-value");
      expect(response.body.expiresIn).toBe(300);
      expect(mockGenerateMfaToken).toHaveBeenCalledWith("google-uid-123456");
    });
  });
});
