import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

const { mockExchangeFiatToMpt, mockExchangeMptToFiat } = vi.hoisted(() => ({
  mockExchangeFiatToMpt: vi.fn(),
  mockExchangeMptToFiat: vi.fn(),
}));

vi.mock("../../src/token/services/exchange.service", () => ({
  exchangeFiatToMpt: mockExchangeFiatToMpt,
  exchangeMptToFiat: mockExchangeMptToFiat,
}));

const AUTH = { Authorization: "Bearer valid-session" };
// 2^53 — one above MAX_SAFE_AMOUNT (Number.MAX_SAFE_INTEGER), so the .max() check rejects it.
const OVER_MAX = 9_007_199_254_740_992;

describe("Exchange Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
    mockExchangeFiatToMpt.mockReset();
    mockExchangeMptToFiat.mockReset();
  });

  describe("POST /api/v1/exchange/fiat-to-mpt", () => {
    const VALID = { tokenId: "JPYN", fiatAmount: 1000 };

    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", VALID);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when KYC is not approved", async () => {
      mockIdentityPlatformAuth.setupWithoutMfa(); // no kycStatus=approved
      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", VALID, AUTH);
      restAssert.expectError(response, 403, "KYC required");
    });

    it("returns 400 for a zero amount", async () => {
      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", { ...VALID, fiatAmount: 0 }, AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for a non-integer amount", async () => {
      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", { ...VALID, fiatAmount: 1.5 }, AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for an amount above the safe ceiling", async () => {
      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", { ...VALID, fiatAmount: OVER_MAX }, AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for a missing tokenId", async () => {
      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", { fiatAmount: 1000 }, AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockExchangeFiatToMpt.mockResolvedValue({ orderId: "ord-1", status: "completed" });

      const response = await helper.post("/api/v1/exchange/fiat-to-mpt", VALID, AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockExchangeFiatToMpt).toHaveBeenCalledWith("google-uid-123456", "JPYN", 1000);
    });
  });

  describe("POST /api/v1/exchange/mpt-to-fiat", () => {
    const VALID = { tokenId: "JPYN", tokenAmount: 1000 };

    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/exchange/mpt-to-fiat", VALID);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when KYC is not approved", async () => {
      mockIdentityPlatformAuth.setupWithoutMfa();
      const response = await helper.post("/api/v1/exchange/mpt-to-fiat", VALID, AUTH);
      restAssert.expectError(response, 403, "KYC required");
    });

    it("returns 400 for a zero amount", async () => {
      const response = await helper.post("/api/v1/exchange/mpt-to-fiat", { ...VALID, tokenAmount: 0 }, AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for an amount above the safe ceiling", async () => {
      const response = await helper.post("/api/v1/exchange/mpt-to-fiat", { ...VALID, tokenAmount: OVER_MAX }, AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockExchangeMptToFiat.mockResolvedValue({ orderId: "ord-2", status: "completed" });

      const response = await helper.post("/api/v1/exchange/mpt-to-fiat", VALID, AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockExchangeMptToFiat).toHaveBeenCalledWith("google-uid-123456", "JPYN", 1000);
    });
  });
});
