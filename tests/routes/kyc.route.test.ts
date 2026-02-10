import type express from "express";
import { MOCK_KYC_DOC, MOCK_USER_DOC_BASE } from "../utils/data";
import { restAssert } from "../utils/helpers";
import { mockFirestoreService, mockIdentityPlatformAuth } from "../utils/mock.index";
import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

// Mock wallet.service to avoid real Secret Manager calls
jest.mock("../../src/token/services/wallet.service", () => ({
  deriveWallet: jest.fn().mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" }),
  getWalletForSigning: jest.fn().mockResolvedValue({ sign: jest.fn() }),
  allocateXrpAddressIndex: jest.fn().mockResolvedValue(1),
}));

// Mock faucet.service to avoid real XRPL faucet calls
jest.mock("../../src/token/services/faucet.service", () => ({
  fundAccount: jest.fn().mockResolvedValue({ balance: 1000 }),
}));

// Mock trustline.service to avoid real XRPL trustline calls
jest.mock("../../src/token/services/trustline.service", () => ({
  hasTrustLine: jest.fn().mockResolvedValue(false),
  setTrustLine: jest.fn().mockResolvedValue("mock-trustline-tx-hash"),
  ensureTrustLine: jest.fn().mockResolvedValue(undefined),
}));

// Mock bank config to avoid real Secret Manager calls
jest.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: jest.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: jest.fn().mockResolvedValue("mock-bank-auth-token"),
}));

const VALID_KYC_INPUT = {
  fullName: "山田 太郎",
  phoneNumber: "09012345678",
  postalCode: "1000001",
  prefecture: "東京都",
  city: "千代田区",
  town: "丸の内",
  address: "1-1-1",
};

describe("KYC Routes - REST API Integration", () => {
  let app: express.Application;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockFirestoreService.reset();
    mockFirestoreService.setup();
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
  });

  describe("POST /api/v1/users/me/kyc", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.post("/api/v1/users/me/kyc", VALID_KYC_INPUT);

      restAssert.expectError(response, 401);
    });

    it("should submit KYC and set status to approved", async () => {
      // 1st get: userRef.get() → user exists with kycStatus none
      // 2nd get: kycRef.get() after set → kyc data
      mockFirestoreService.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER_DOC_BASE,
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_KYC_DOC,
        });

      const response = await helper.post("/api/v1/users/me/kyc", VALID_KYC_INPUT, {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response, 201);
      expect(response.body.fullName).toBe("山田 太郎");
      expect(response.body.status).toBe("approved");
      expect(mockFirestoreService.set).toHaveBeenCalled();
      expect(mockFirestoreService.update).toHaveBeenCalled();
    });

    it("should return 409 if KYC already approved", async () => {
      mockFirestoreService.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...MOCK_USER_DOC_BASE, kycStatus: "approved" }),
      });

      const response = await helper.post("/api/v1/users/me/kyc", VALID_KYC_INPUT, {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectError(response, 409, "KYC already approved");
    });

    it("should return 400 for invalid phone number", async () => {
      const response = await helper.post(
        "/api/v1/users/me/kyc",
        { ...VALID_KYC_INPUT, phoneNumber: "12345" },
        { Authorization: "Bearer valid-session" },
      );

      // OpenAPI validator rejects the pattern before reaching the service
      restAssert.expectError(response, 400);
    });

    it("should return 400 for invalid postal code", async () => {
      const response = await helper.post(
        "/api/v1/users/me/kyc",
        { ...VALID_KYC_INPUT, postalCode: "ABC" },
        { Authorization: "Bearer valid-session" },
      );

      restAssert.expectError(response, 400);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await helper.post(
        "/api/v1/users/me/kyc",
        { fullName: "山田 太郎" },
        { Authorization: "Bearer valid-session" },
      );

      restAssert.expectError(response, 400);
    });
  });
});
