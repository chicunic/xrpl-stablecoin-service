import type express from "express";
import {
  MOCK_USER_DOC_BASE,
  MOCK_VIRTUAL_ACCOUNT_DOC,
  MOCK_WALLET_DOC,
  TEST_USER_EMAIL,
  TEST_USER_UID,
} from "../utils/data";
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

// Mock global fetch for bank API calls
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    bankCode: "9999",
    branchCode: "001",
    accountNumber: "0010001",
    accountHolder: "Mock User",
  }),
});
global.fetch = mockFetch as unknown as typeof fetch;

describe("Auth Routes - REST API Integration", () => {
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

  describe("GET /api/v1/users/me", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.get("/api/v1/users/me");

      restAssert.expectError(response, 401);
    });

    it("should return 401 with invalid token", async () => {
      mockIdentityPlatformAuth.verifySessionCookie.mockRejectedValue(
        new Error("Error expected in test: invalid token"),
      );

      const response = await helper.get("/api/v1/users/me", {
        Authorization: "Bearer invalid-session",
      });

      restAssert.expectError(response, 401);
    });

    it("should return existing user info with valid token", async () => {
      // Setup: user exists in Firestore
      mockFirestoreService.get.mockResolvedValue({
        exists: true,
        data: () => MOCK_USER_DOC_BASE,
      });

      const response = await helper.get("/api/v1/users/me", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response);
      expect(response.body.uid).toBe(TEST_USER_UID);
      expect(response.body.email).toBe(TEST_USER_EMAIL);
      expect(response.body.fiatBalance).toBeDefined();
    });

    it("should create basic user record without wallet on first call", async () => {
      // 1st get: userRef.get() → user doesn't exist
      // 2nd get: userRef.get() after set → base user exists
      mockFirestoreService.get
        .mockResolvedValueOnce({ exists: false, data: () => ({}) })
        .mockResolvedValueOnce({ exists: true, data: () => MOCK_USER_DOC_BASE });

      const response = await helper.get("/api/v1/users/me", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response);
      expect(mockFirestoreService.set).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/users/me/wallet", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.post("/api/v1/users/me/wallet", {});

      restAssert.expectError(response, 401);
    });

    it("should set up wallet for user without wallet", async () => {
      // 1st get: walletRef.get() → wallet doesn't exist
      // 2nd get: walletRef.get() after set → wallet with data
      mockFirestoreService.get
        .mockResolvedValueOnce({ exists: false, data: () => ({}) })
        .mockResolvedValueOnce({ exists: true, data: () => MOCK_WALLET_DOC });

      const response = await helper.post(
        "/api/v1/users/me/wallet",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectSuccess(response, 201);
      expect(response.body.address).toBeDefined();
      expect(mockFirestoreService.set).toHaveBeenCalled();
    });

    it("should return 409 if wallet already set up", async () => {
      mockFirestoreService.get.mockResolvedValue({
        exists: true,
        data: () => MOCK_WALLET_DOC,
      });

      const response = await helper.post(
        "/api/v1/users/me/wallet",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectError(response, 409, "Wallet already set up");
    });
  });

  describe("POST /api/v1/users/me/virtual-account", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.post("/api/v1/users/me/virtual-account", {});

      restAssert.expectError(response, 401);
    });

    it("should set up virtual account for user without one", async () => {
      // 1st get: vaRef.get() → virtual account doesn't exist
      // 2nd get: vaRef.get() after set → virtual account with data
      mockFirestoreService.get
        .mockResolvedValueOnce({ exists: false, data: () => ({}) })
        .mockResolvedValueOnce({ exists: true, data: () => MOCK_VIRTUAL_ACCOUNT_DOC });

      const response = await helper.post(
        "/api/v1/users/me/virtual-account",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectSuccess(response, 201);
      expect(response.body.branchCode).toBeDefined();
      expect(response.body.accountNumber).toBeDefined();
      expect(response.body.bankCode).toBeDefined();
      expect(mockFirestoreService.set).toHaveBeenCalled();
    });

    it("should return 409 if virtual account already set up", async () => {
      mockFirestoreService.get.mockResolvedValue({
        exists: true,
        data: () => MOCK_VIRTUAL_ACCOUNT_DOC,
      });

      const response = await helper.post(
        "/api/v1/users/me/virtual-account",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectError(response, 409, "Virtual account already set up");
    });
  });
});
