import type express from "express";
import { MOCK_WALLET_DOC } from "../utils/data";
import { restAssert } from "../utils/helpers";
import { mockFirestoreService, mockIdentityPlatformAuth } from "../utils/mock.index";
import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

// Mock credential.service
const mockGetCredentialStatus = vi.fn();
const mockIssueCredential = vi.fn();
const mockAcceptCredential = vi.fn();
vi.mock("../../src/token/services/credential.service", () => ({
  getCredentialStatus: (...args: any[]) => mockGetCredentialStatus(...args),
  issueCredential: (...args: any[]) => mockIssueCredential(...args),
  acceptCredential: (...args: any[]) => mockAcceptCredential(...args),
  CREDENTIAL_TYPE_KYC_JAPAN_HEX: "4B59435F4A4150414E",
}));

// Mock wallet.service
vi.mock("../../src/token/services/wallet.service", () => ({
  deriveWallet: vi.fn().mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" }),
  getWalletForSigning: vi.fn().mockResolvedValue({ sign: vi.fn() }),
  allocateXrpAddressIndex: vi.fn().mockResolvedValue(1),
}));

// Mock faucet.service
vi.mock("../../src/token/services/faucet.service", () => ({
  fundAccount: vi.fn().mockResolvedValue({ balance: 1000 }),
}));

// Mock trustline.service
vi.mock("../../src/token/services/trustline.service", () => ({
  hasTrustLine: vi.fn().mockResolvedValue(false),
  setTrustLine: vi.fn().mockResolvedValue("mock-trustline-tx-hash"),
  ensureTrustLine: vi.fn().mockResolvedValue(undefined),
}));

// Mock dex.service
vi.mock("../../src/token/services/dex.service", () => ({
  createPermissionedOffer: vi.fn(),
  cancelOffer: vi.fn(),
  getPermissionedOrderBook: vi.fn(),
  buildOfferAmounts: vi.fn(),
  tfHybrid: 0x00800000,
}));

// Mock bank config
vi.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: vi.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: vi.fn().mockResolvedValue("mock-bank-auth-token"),
}));

describe("Credential Routes - REST API Integration", () => {
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
    mockGetCredentialStatus.mockReset();
    mockIssueCredential.mockReset();
    mockAcceptCredential.mockReset();
  });

  describe("GET /api/v1/users/me/credential", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.get("/api/v1/users/me/credential");
      restAssert.expectError(response, 401);
    });

    it("should return 404 if wallet not found", async () => {
      // getUserWallet: single get on users/{uid}/wallet/default
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: false,
        data: () => null,
      });

      const response = await helper.get("/api/v1/users/me/credential", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectError(response, 404, "Wallet not found");
    });

    it("should return credential status", async () => {
      // getUserWallet: single get returns wallet doc
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: true,
        data: () => MOCK_WALLET_DOC,
      });

      mockGetCredentialStatus.mockResolvedValue({
        exists: true,
        accepted: true,
      });

      const response = await helper.get("/api/v1/users/me/credential", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response, 200);
      expect(response.body.exists).toBe(true);
      expect(response.body.accepted).toBe(true);
      expect(mockGetCredentialStatus).toHaveBeenCalledWith(
        MOCK_WALLET_DOC.address,
        expect.any(String),
        "4B59435F4A4150414E",
      );
    });
  });

  describe("POST /api/v1/users/me/credential/retry", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.post("/api/v1/users/me/credential/retry", {});
      restAssert.expectError(response, 401);
    });

    it("should return 404 if wallet not found", async () => {
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: false,
        data: () => null,
      });

      const response = await helper.post(
        "/api/v1/users/me/credential/retry",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectError(response, 404, "Wallet not found");
    });

    it("should retry credential issuance and return hashes", async () => {
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: true,
        data: () => MOCK_WALLET_DOC,
      });

      mockIssueCredential.mockResolvedValue("mock-issue-tx-hash");
      mockAcceptCredential.mockResolvedValue("mock-accept-tx-hash");

      const response = await helper.post(
        "/api/v1/users/me/credential/retry",
        {},
        {
          Authorization: "Bearer valid-session",
        },
      );

      restAssert.expectSuccess(response, 200);
      expect(response.body.credentialTxHash).toBe("mock-issue-tx-hash");
      expect(response.body.credentialAcceptTxHash).toBe("mock-accept-tx-hash");
      expect(response.body.credentialStatus).toBe("accepted");
    });
  });
});
