import type express from "express";
import { MOCK_WALLET_DOC } from "../utils/data";
import { restAssert } from "../utils/helpers";
import { mockFirestoreService, mockIdentityPlatformAuth } from "../utils/mock.index";
import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

// Set JPYN_DOMAIN_ID before importing tokens config
process.env.JPYN_DOMAIN_ID = "mock-domain-id-123";

// Mock dex.service
const mockCreatePermissionedOffer = jest.fn();
const mockCancelOffer = jest.fn();
const mockGetPermissionedOrderBook = jest.fn();
const mockBuildOfferAmounts = jest.fn();
jest.mock("../../src/token/services/dex.service", () => ({
  createPermissionedOffer: (...args: any[]) => mockCreatePermissionedOffer(...args),
  cancelOffer: (...args: any[]) => mockCancelOffer(...args),
  getPermissionedOrderBook: (...args: any[]) => mockGetPermissionedOrderBook(...args),
  buildOfferAmounts: (...args: any[]) => mockBuildOfferAmounts(...args),
  tfHybrid: 0x00800000,
}));

// Mock credential.service
jest.mock("../../src/token/services/credential.service", () => ({
  issueCredential: jest.fn().mockResolvedValue("mock-credential-tx-hash"),
  acceptCredential: jest.fn().mockResolvedValue("mock-credential-accept-tx-hash"),
  getCredentialStatus: jest.fn(),
  CREDENTIAL_TYPE_KYC_JAPAN_HEX: "4B59435F4A4150414E",
}));

// Mock wallet.service
jest.mock("../../src/token/services/wallet.service", () => ({
  deriveWallet: jest.fn().mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" }),
  getWalletForSigning: jest.fn().mockResolvedValue({ sign: jest.fn() }),
  allocateXrpAddressIndex: jest.fn().mockResolvedValue(1),
}));

// Mock faucet.service
jest.mock("../../src/token/services/faucet.service", () => ({
  fundAccount: jest.fn().mockResolvedValue({ balance: 1000 }),
}));

// Mock trustline.service
jest.mock("../../src/token/services/trustline.service", () => ({
  hasTrustLine: jest.fn().mockResolvedValue(false),
  setTrustLine: jest.fn().mockResolvedValue("mock-trustline-tx-hash"),
  ensureTrustLine: jest.fn().mockResolvedValue(undefined),
}));

// Mock bank config
jest.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: jest.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: jest.fn().mockResolvedValue("mock-bank-auth-token"),
}));

const VALID_OFFER_INPUT = {
  tokenId: "JPYN",
  side: "buy",
  amount: "100",
  price: "1",
};

describe("DEX Routes - REST API Integration", () => {
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
    mockCreatePermissionedOffer.mockReset();
    mockCancelOffer.mockReset();
    mockGetPermissionedOrderBook.mockReset();
    mockBuildOfferAmounts.mockReset();
  });

  /* ── POST /api/v1/dex/offers ──────────────────────── */

  describe("POST /api/v1/dex/offers", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.post("/api/v1/dex/offers", VALID_OFFER_INPUT);
      restAssert.expectError(response, 401);
    });

    it("should return 404 if wallet not found", async () => {
      // getUserWallet: single get on users/{uid}/wallet/default
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: false,
        data: () => null,
      });

      const response = await helper.post("/api/v1/dex/offers", VALID_OFFER_INPUT, {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectError(response, 404, "Wallet not found");
    });

    it("should create a permissioned offer and return 201", async () => {
      // getUserWallet: single get returns wallet doc
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: true,
        data: () => MOCK_WALLET_DOC,
      });

      mockBuildOfferAmounts.mockReturnValue({
        takerGets: { currency: "4A50594E00000000000000000000000000000000", issuer: "rIssuer", value: "100" },
        takerPays: "100000000",
      });
      mockCreatePermissionedOffer.mockResolvedValue({
        txHash: "mock-offer-tx-hash",
        offerSequence: 42,
      });

      const response = await helper.post("/api/v1/dex/offers", VALID_OFFER_INPUT, {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response, 201);
      expect(response.body.txHash).toBe("mock-offer-tx-hash");
      expect(response.body.offerSequence).toBe(42);
      expect(mockCreatePermissionedOffer).toHaveBeenCalled();
    });

    it("should return 400 for missing required fields", async () => {
      const response = await helper.post(
        "/api/v1/dex/offers",
        { tokenId: "JPYN" },
        { Authorization: "Bearer valid-session" },
      );

      restAssert.expectError(response, 400);
    });
  });

  /* ── DELETE /api/v1/dex/offers/:offerSequence ─────── */

  describe("DELETE /api/v1/dex/offers/:offerSequence", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.delete("/api/v1/dex/offers/42");
      restAssert.expectError(response, 401);
    });

    it("should return 404 if wallet not found", async () => {
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: false,
        data: () => null,
      });

      const response = await helper.delete("/api/v1/dex/offers/42", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectError(response, 404, "Wallet not found");
    });

    it("should cancel offer and return txHash", async () => {
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: true,
        data: () => MOCK_WALLET_DOC,
      });

      mockCancelOffer.mockResolvedValue("mock-cancel-tx-hash");

      const response = await helper.delete("/api/v1/dex/offers/42", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response, 200);
      expect(response.body.txHash).toBe("mock-cancel-tx-hash");
      expect(mockCancelOffer).toHaveBeenCalledWith(MOCK_WALLET_DOC.bipIndex, MOCK_WALLET_DOC.address, 42);
    });
  });

  /* ── GET /api/v1/dex/orderbook ────────────────────── */

  describe("GET /api/v1/dex/orderbook", () => {
    it("should return 401 without auth header", async () => {
      const response = await helper.get("/api/v1/dex/orderbook?tokenId=JPYN");
      restAssert.expectError(response, 401);
    });

    it("should return 400 if tokenId is missing", async () => {
      const response = await helper.get("/api/v1/dex/orderbook", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectError(response, 400);
    });

    it("should return orderbook data", async () => {
      mockGetPermissionedOrderBook.mockResolvedValue({
        asks: [{ price: "1.0", amount: "100" }],
        bids: [],
      });

      const response = await helper.get("/api/v1/dex/orderbook?tokenId=JPYN", {
        Authorization: "Bearer valid-session",
      });

      restAssert.expectSuccess(response, 200);
      expect(response.body.asks).toHaveLength(1);
      expect(response.body.bids).toHaveLength(0);
      expect(mockGetPermissionedOrderBook).toHaveBeenCalled();
    });
  });
});
