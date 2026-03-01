import type express from "express";
import { restAssert } from "../utils/helpers";
import { mockFirestoreService, mockIdentityPlatformAuth } from "../utils/mock.index";

// Mock bank config to avoid real Secret Manager calls
vi.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: vi.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: vi.fn().mockResolvedValue("mock-bank-auth-token"),
}));

// Mock xrpl.service to avoid real XRPL connections
vi.mock("../../src/token/services/xrpl.service", () => ({
  sendToken: vi.fn().mockResolvedValue("mock-tx-hash"),
  sendTokenFromUser: vi.fn().mockResolvedValue("mock-tx-hash"),
  sendXrpFromUser: vi.fn().mockResolvedValue("mock-tx-hash"),
  getBalances: vi.fn().mockResolvedValue([]),
  getClient: vi.fn().mockResolvedValue({}),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

// Mock wallet.service to avoid real Secret Manager calls
vi.mock("../../src/token/services/wallet.service", () => ({
  deriveWallet: vi.fn().mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" }),
  getWalletForSigning: vi.fn().mockResolvedValue({ sign: vi.fn() }),
  allocateXrpAddressIndex: vi.fn().mockResolvedValue(1),
}));

// Mock faucet.service to avoid real XRPL faucet calls
vi.mock("../../src/token/services/faucet.service", () => ({
  fundAccount: vi.fn().mockResolvedValue({ balance: 1000 }),
}));

// Mock trustline.service to avoid real XRPL trustline calls
vi.mock("../../src/token/services/trustline.service", () => ({
  hasTrustLine: vi.fn().mockResolvedValue(false),
  setTrustLine: vi.fn().mockResolvedValue("mock-trustline-tx-hash"),
  ensureTrustLine: vi.fn().mockResolvedValue(undefined),
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
        // getUserByVirtualAccountNumber -> collectionGroup query
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
        // tx.get(idempotencyRef) - not yet processed
        .mockResolvedValueOnce({
          exists: false,
          data: () => ({}),
        })
        // tx.get(userRef)
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER,
        });

      const envelope = createPubSubEnvelope({
        transactionId: "bank-tx-123",
        amount: 10000,
        virtualAccountNumber: "0010001",
      });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("ok");
    });

    it("should skip duplicate message (idempotency)", async () => {
      const MOCK_USER = {
        uid: "google-uid-123456",
        email: "test@example.com",
        name: "Test User",
        fiatBalance: 10000,
      };

      mockFirestoreService.get
        // getUserByVirtualAccountNumber -> collectionGroup query
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              data: () => ({ accountNumber: "0010001" }),
              ref: { parent: { parent: { id: "google-uid-123456" } } },
            },
          ],
        })
        // tx.get(idempotencyRef) - already processed
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ messageId: "test-msg-123", type: "bank-deposit" }),
        })
        // tx.get(userRef)
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER,
        });

      const envelope = createPubSubEnvelope({
        transactionId: "bank-tx-123",
        amount: 10000,
        virtualAccountNumber: "0010001",
      });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("ok");
    });

    it("should return 200 for invalid data in envelope (avoid infinite retry)", async () => {
      const envelope = createPubSubEnvelope({ invalidField: "no required fields" });

      const response = await helper.post("/api/v1/pubsub/bank/deposit", envelope);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
    });

    it("should return 500 on processing error (trigger Pub/Sub retry)", async () => {
      // getUserByVirtualAccountNumber throws
      mockFirestoreService.get.mockRejectedValueOnce(new Error("Firestore unavailable"));

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
