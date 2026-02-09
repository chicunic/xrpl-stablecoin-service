import type express from "express";
import { restAssert } from "../utils/helpers";
import { enableIdempotencyMock, mockFirestoreService, mockGoogleAuth, mockIdempotency } from "../utils/mock.index";

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

import { getTokenConfig } from "../../src/token/config/tokens";
import { createCompleteTestApp, RestTestHelper } from "../utils/server.rest";

const ISSUER_ADDRESS = getTokenConfig("JPYN").issuerAddress;

// Helper to create Eventarc CloudEvent body with Firestore document format
function createEventarcBody(txHash: string, fields: Record<string, unknown>) {
  return {
    document: {
      name: `projects/nexbridge-486208/databases/(default)/documents/tokenTransactions/${txHash}`,
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
    mockGoogleAuth.reset();
    mockGoogleAuth.setup();
    mockIdempotency.reset();
    mockIdempotency.setup();
  });

  describe("POST /api/v1/eventarc/xrpl/deposit", () => {
    const MOCK_USER = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      fiatBalance: 0,
    };

    it("should process successful XRPL token deposit", async () => {
      // collectionGroup("wallet") query returns matching wallet
      mockFirestoreService.get
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
        // creditTokenBalance -> tokenBalanceRef.get()
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ balance: 0 }),
        })
        // creditTokenBalance -> transactionDoc.get()
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            transactionId: "mock-token-tx",
            type: "deposit",
            amount: 100,
            balance: 100,
          }),
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
      expect(mockIdempotency.checkAndMarkProcessed).toHaveBeenCalledWith("ABC123HASH", "xrpl-deposit");
    });

    it("should skip duplicate event (idempotency)", async () => {
      mockIdempotency.checkAndMarkProcessed.mockResolvedValueOnce(true);

      const body = createEventarcBody("ABC123HASH", {
        transactionType: stringVal("Payment"),
        meta: mapVal({ TransactionResult: stringVal("tesSUCCESS") }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("skipped");
      expect(response.body.reason).toBe("duplicate");
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
      mockIdempotency.checkAndMarkProcessed.mockRejectedValueOnce(new Error("Firestore unavailable"));

      const body = createEventarcBody("ERRORHASH", {
        transactionType: stringVal("Payment"),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      expect(response.status).toBe(500);
    });
  });
});
