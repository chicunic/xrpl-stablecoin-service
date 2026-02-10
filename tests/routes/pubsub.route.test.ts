import type express from "express";
import { restAssert } from "../utils/helpers";
import {
  enableIdempotencyMock,
  mockFirestoreService,
  mockIdempotency,
  mockIdentityPlatformAuth,
} from "../utils/mock.index";

// Mock idempotency before route imports
enableIdempotencyMock();

// Mock bank config to avoid real Secret Manager calls
jest.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: jest.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: jest.fn().mockResolvedValue("mock-bank-auth-token"),
}));

// Mock xrpl.service to avoid real XRPL connections
jest.mock("../../src/token/services/xrpl.service", () => ({
  sendToken: jest.fn().mockResolvedValue("mock-tx-hash"),
  sendTokenFromUser: jest.fn().mockResolvedValue("mock-tx-hash"),
  sendXrpFromUser: jest.fn().mockResolvedValue("mock-tx-hash"),
  getBalances: jest.fn().mockResolvedValue([]),
  getClient: jest.fn().mockResolvedValue({}),
  disconnect: jest.fn().mockResolvedValue(undefined),
}));

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

import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

function createPubSubEnvelope(data: Record<string, unknown>, messageId = "test-msg-123"): object {
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
  return {
    message: {
      data: encoded,
      messageId,
    },
    subscription: "projects/test/subscriptions/test-sub",
  };
}

describe("Pub/Sub Routes - REST API Integration", () => {
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
    mockIdempotency.reset();
    mockIdempotency.setup();
  });

  describe("POST /api/v1/pubsub/bank/deposit", () => {
    it("should process bank deposit via Pub/Sub envelope", async () => {
      const MOCK_USER = {
        uid: "google-uid-123456",
        email: "test@example.com",
        name: "Test User",
        fiatBalance: 0,
      };

      mockFirestoreService.get
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          data: () => ({ accountNumber: "0010001" }),
          docs: [
            {
              data: () => ({ accountNumber: "0010001" }),
              ref: { parent: { parent: { id: "google-uid-123456" } } },
            },
          ],
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER,
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER,
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            transactionId: "mock-fiat-tx",
            type: "deposit",
            amount: 10000,
            balance: 10000,
            description: "Bank deposit via virtual account 0010001",
            relatedOrderId: "bank-tx-123",
            createdAt: "mock-timestamp",
          }),
        });

      const envelope = createPubSubEnvelope({
        transactionId: "bank-tx-123",
        amount: 10000,
        virtualAccountNumber: "0010001",
      });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("ok");
      expect(mockIdempotency.checkAndMarkProcessed).toHaveBeenCalledWith("test-msg-123", "bank-deposit");
    });

    it("should skip duplicate message (idempotency)", async () => {
      mockIdempotency.checkAndMarkProcessed.mockResolvedValueOnce(true);

      const envelope = createPubSubEnvelope({
        transactionId: "bank-tx-123",
        amount: 10000,
        virtualAccountNumber: "0010001",
      });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("duplicate");
    });

    it("should return 200 for invalid data in envelope (avoid infinite retry)", async () => {
      const envelope = createPubSubEnvelope({ invalidField: "no required fields" });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
    });

    it("should return 500 on processing error (trigger Pub/Sub retry)", async () => {
      mockIdempotency.checkAndMarkProcessed.mockRejectedValueOnce(new Error("Firestore unavailable"));

      const envelope = createPubSubEnvelope({
        transactionId: "bank-tx-123",
        amount: 10000,
        virtualAccountNumber: "0010001",
      });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      expect(response.status).toBe(500);
    });

    it("should return 400 for invalid envelope format", async () => {
      const response = await helper.post("/api/v1/pubsub/bank/deposit", { invalid: "body" });

      // OpenAPI validator rejects the request before it reaches the route handler
      restAssert.expectError(response, 400);
    });
  });
});
