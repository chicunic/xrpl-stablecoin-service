import { restAssert } from "../utils/helpers";
import { mockFirestoreService, mockIdentityPlatformAuth } from "../utils/mock.index";

// Mock bank config to avoid real Secret Manager calls
vi.mock("../../src/token/config/bank", () => ({
  getBankServiceUrl: vi.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: vi.fn().mockResolvedValue("mock-bank-auth-token"),
}));

// Mock xrpl.service to avoid real XRPL connections
vi.mock("../../src/token/services/xrpl.service", () => ({
  mint: vi.fn().mockResolvedValue("mock-tx-hash"),
  transfer: vi.fn().mockResolvedValue("mock-tx-hash"),
  burn: vi.fn().mockResolvedValue("mock-tx-hash"),
  authorize: vi.fn().mockResolvedValue("mock-tx-hash"),
  issuerAuthorize: vi.fn().mockResolvedValue("mock-tx-hash"),
  hasMptAuthorization: vi.fn().mockResolvedValue(false),
  sendXrpFromUser: vi.fn().mockResolvedValue("mock-tx-hash"),
  getMptBalances: vi.fn().mockResolvedValue([]),
  getClient: vi.fn().mockResolvedValue({}),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

// Mock wallet.service to avoid real Secret Manager calls
vi.mock("../../src/token/services/wallet.service", () => ({
  deriveWallet: vi.fn().mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" }),
  getWalletForSigning: vi.fn().mockResolvedValue({ sign: vi.fn() }),
}));

// Mock faucet.service to avoid real XRPL faucet calls
vi.mock("../../src/token/services/faucet.service", () => ({
  fundAccount: vi.fn().mockResolvedValue({ balance: 1000 }),
}));

import { __setTokenConfigForTest } from "../../src/token/config/tokens";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

// Inject a deterministic issuance id (env timing vs module load is unreliable under vitest).
const MPT_ISSUANCE_ID = "00000000ABCDEF1234567890ABCDEF1234567890ABCD";
__setTokenConfigForTest("JPYN", { mptIssuanceId: MPT_ISSUANCE_ID });

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
  return { integerValue: String(v) } as const;
}
void _intVal;
function mapVal(fields: Record<string, unknown>) {
  return { mapValue: { fields } };
}

describe("Eventarc Routes - REST API Integration", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
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
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string };
      expect(resBody.status).toBe("ok");
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
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string };
      expect(resBody.status).toBe("ok");
    });

    it("should skip event with missing document name", async () => {
      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", { document: {} });

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string; reason: string };
      expect(resBody.status).toBe("skipped");
      expect(resBody.reason).toBe("invalid event");
    });

    it("should skip failed transaction (non-tesSUCCESS)", async () => {
      const body = createEventarcBody("FAILHASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tecPATH_DRY"),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string; reason: string };
      expect(resBody.status).toBe("skipped");
      expect(resBody.reason).toBe("transaction not successful");
    });

    it("should skip burn transaction", async () => {
      const body = createEventarcBody("BURNHASH", {
        transactionType: stringVal("burn"),
        tx_json: mapVal({
          Account: stringVal("rUser123"),
          Destination: stringVal("rIssuer456"),
          Amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("50"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("50"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string; reason: string };
      expect(resBody.status).toBe("skipped");
      expect(resBody.reason).toBe("burn transaction");
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
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string; reason: string };
      expect(resBody.status).toBe("skipped");
      expect(resBody.reason).toBe("destination is not a custodial wallet");
    });

    it("should skip unknown token (mpt_issuance_id not in config)", async () => {
      const body = createEventarcBody("UNKNOWNHASH", {
        transactionType: stringVal("Payment"),
        tx_json: mapVal({
          Account: stringVal("rSender999"),
          Destination: stringVal("rDestination123"),
          Amount: mapVal({
            mpt_issuance_id: stringVal("00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"),
            value: stringVal("100"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            mpt_issuance_id: stringVal("00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"),
            value: stringVal("100"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      restAssert.expectSuccess(response);
      const resBody = response.body as { status: string; reason: string };
      expect(resBody.status).toBe("skipped");
      expect(resBody.reason).toBe("unknown token");
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
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
        meta: mapVal({
          TransactionResult: stringVal("tesSUCCESS"),
          delivered_amount: mapVal({
            mpt_issuance_id: stringVal(MPT_ISSUANCE_ID),
            value: stringVal("100"),
          }),
        }),
      });

      const response = await helper.post("/api/v1/eventarc/xrpl/deposit", body);

      expect(response.status).toBe(500);
    });
  });
});
