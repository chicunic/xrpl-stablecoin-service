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

import { getTokenConfig } from "../../src/token/config/tokens";
import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

const ISSUER_ADDRESS = getTokenConfig("JPYN").issuerAddress;

// Helper to create Eventarc CloudEvent body with Firestore document format
function createEventarcBody(txHash: string, fields: Record<string, unknown>) {
  return {
    document: {
      name: `projects/test-project/databases/(default)/documents/tokenTransactions/${txHash}`,
      fields,
    },
  };
}

// Helper to wrap a value in Firestore REST API format
function stringVal(v: string) {
  return { stringValue: v };
}
function _intVal(v: number) {
  return { integerValue: String(v) };
}
function mapVal(fields: Record<string, unknown>) {
  return { mapValue: { fields } };
}

describe("Eventarc Routes - REST API Integration", () => {
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

  describe("POST /api/v1/eventarc/xrpl/deposit", () => {
    const MOCK_USER = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      fiatBalance: 0,
    };

    it("should process successful XRPL token deposit", async () => {
      mockFirestoreService.get
        // collectionGroup("wallet") query returns matching wallet
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              data: () => ({ address: "rDestination123" }),
              ref: { parent: { parent: { id: "google-uid-123456" } } },
            },
          ],
        })
        // getUserByWalletAddress -> userDoc.get()
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER,
        })
        // tx.get(idempotencyRef) - not yet processed
        .mockResolvedValueOnce({
          exists: false,
          data: () => ({}),
        });

      const body = createEventarcBody("ABC123HASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("ok");
    });

    it("should skip duplicate event (idempotency)", async () => {
      mockFirestoreService.get
        // collectionGroup("wallet") query returns matching wallet
        .mockResolvedValueOnce({
          exists: true,
          empty: false,
          docs: [
            {
              data: () => ({ address: "rDestination123" }),
              ref: { parent: { parent: { id: "google-uid-123456" } } },
            },
          ],
        })
        // getUserByWalletAddress -> userDoc.get()
        .mockResolvedValueOnce({
          exists: true,
          data: () => MOCK_USER,
        })
        // tx.get(idempotencyRef) - already processed
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ messageId: "ABC123HASH", type: "xrpl-deposit" }),
        });

      const body = createEventarcBody("ABC123HASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("ok");
    });

    it("should skip event with missing document name", async () => {
      const body = { document: {} };

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("invalid event");
    });

    it("should skip failed transaction (non-tesSUCCESS)", async () => {
      const body = createEventarcBody("FAILHASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tecPATH_DRY"),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("transaction not successful");
    });

    it("should skip burn transaction", async () => {
      const body = createEventarcBody("BURNHASH", {
        transactionType: stringVal("burn"),
        tx_json: mapVal({
          Account: stringVal("rUser123"),
          Destination: stringVal("rIssuer456"),
          Amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("50"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("50"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("burn transaction");
    });

    it("should skip when destination is not a custodial wallet", async () => {
      // collectionGroup("wallet") query returns empty
      mockFirestoreService.get.mockResolvedValueOnce({
        exists: false,
        empty: true,
        docs: [],
      });

      const body = createEventarcBody("EXTERNALHASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rExternalAddress"),
          Amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("destination is not a custodial wallet");
    });

    it("should skip unknown token (currency/issuer not in config)", async () => {
      const body = createEventarcBody("UNKNOWNHASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            currency: stringVal("USD"),
            value: stringVal("100"),
            issuer: stringVal("rUnknownIssuer"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            currency: stringVal("USD"),
            value: stringVal("100"),
            issuer: stringVal("rUnknownIssuer"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("unknown token");
    });

    it("should return 500 on processing error (trigger Eventarc retry)", async () => {
      // collectionGroup query throws
      mockFirestoreService.get.mockRejectedValueOnce(new Error("Firestore unavailable"));

      const body = createEventarcBody("ERRORHASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            currency: stringVal("JPYN"),
            value: stringVal("100"),
            issuer: stringVal(ISSUER_ADDRESS),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      expect(response.status).toBe(500);
    });
  });
});
