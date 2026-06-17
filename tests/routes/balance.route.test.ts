import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

// Mock the services this route depends on so we only exercise route boundaries (auth/errors).
const {
  mockGetFiatBalance,
  mockGetFiatTransactions,
  mockGetMptTransactions,
  mockGetAuthorizations,
  mockGetUserWallet,
  mockGetMptBalances,
} = vi.hoisted(() => ({
  mockGetFiatBalance: vi.fn(),
  mockGetFiatTransactions: vi.fn(),
  mockGetMptTransactions: vi.fn(),
  mockGetAuthorizations: vi.fn(),
  mockGetUserWallet: vi.fn(),
  mockGetMptBalances: vi.fn(),
}));

vi.mock("../../src/token/services/fiat.service", () => ({
  getFiatBalance: mockGetFiatBalance,
  getFiatTransactions: mockGetFiatTransactions,
}));

vi.mock("../../src/token/services/token-balance.service", () => ({
  getMptTransactions: mockGetMptTransactions,
  getAuthorizations: mockGetAuthorizations,
}));

vi.mock("../../src/token/services/auth.service", () => ({
  getUserWallet: mockGetUserWallet,
}));

vi.mock("../../src/token/services/xrpl.service", () => ({
  getMptBalances: mockGetMptBalances,
}));

const AUTH = { Authorization: "Bearer valid-session" };

describe("Balance Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
    mockGetFiatBalance.mockReset();
    mockGetFiatTransactions.mockReset();
    mockGetMptTransactions.mockReset();
    mockGetAuthorizations.mockReset();
    mockGetUserWallet.mockReset();
    mockGetMptBalances.mockReset();
  });

  describe("GET /api/v1/balance/fiat", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/balance/fiat");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the user's fiat balance from the service", async () => {
      mockGetFiatBalance.mockResolvedValue(12345);

      const response = await helper.get("/api/v1/balance/fiat", AUTH);

      restAssert.expectSuccess(response, 200);
      expect((response.body as { balance: number }).balance).toBe(12345);
      expect(mockGetFiatBalance).toHaveBeenCalledWith("google-uid-123456");
    });
  });

  describe("GET /api/v1/balance/mpt", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/balance/mpt");
      restAssert.expectError(response, 401);
    });

    it("returns 400 when the wallet is not set up", async () => {
      mockGetUserWallet.mockResolvedValue(null);

      const response = await helper.get("/api/v1/balance/mpt", AUTH);

      restAssert.expectError(response, 400, "Wallet not set up");
    });

    it("returns 200 with address and balances when the wallet exists", async () => {
      mockGetUserWallet.mockResolvedValue({ address: "rMockAddress123", bipIndex: 1 });
      mockGetMptBalances.mockResolvedValue([{ mptIssuanceId: "ABC", balance: "100" }]);

      const response = await helper.get("/api/v1/balance/mpt", AUTH);

      restAssert.expectSuccess(response, 200);
      const body = response.body as { address: string; balances: unknown[] };
      expect(body.address).toBe("rMockAddress123");
      expect(body.balances).toHaveLength(1);
      expect(mockGetMptBalances).toHaveBeenCalledWith("rMockAddress123");
    });
  });

  describe("GET /api/v1/balance/fiat/transactions", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/balance/fiat/transactions");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the fiat transactions from the service", async () => {
      mockGetFiatTransactions.mockResolvedValue([{ transactionId: "tx-1" }]);

      const response = await helper.get("/api/v1/balance/fiat/transactions", AUTH);

      restAssert.expectSuccess(response, 200);
      expect(response.body).toHaveLength(1);
      expect(mockGetFiatTransactions).toHaveBeenCalledWith("google-uid-123456");
    });
  });

  describe("GET /api/v1/balance/mpt/transactions", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/balance/mpt/transactions");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the MPToken transactions from the service", async () => {
      mockGetMptTransactions.mockResolvedValue([{ transactionId: "tx-1" }]);

      const response = await helper.get("/api/v1/balance/mpt/transactions", AUTH);

      restAssert.expectSuccess(response, 200);
      expect(response.body).toHaveLength(1);
      expect(mockGetMptTransactions).toHaveBeenCalledWith("google-uid-123456");
    });
  });

  describe("GET /api/v1/balance/authorizations", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/balance/authorizations");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with per-token authorization flags", async () => {
      mockGetAuthorizations.mockResolvedValue([]);

      const response = await helper.get("/api/v1/balance/authorizations", AUTH);

      restAssert.expectSuccess(response, 200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(mockGetAuthorizations).toHaveBeenCalledWith("google-uid-123456");
    });
  });
});
