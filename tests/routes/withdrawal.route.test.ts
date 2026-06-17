import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

const { mockWithdrawFiat, mockWithdrawMpt, mockVerifyMfaToken } = vi.hoisted(() => ({
  mockWithdrawFiat: vi.fn(),
  mockWithdrawMpt: vi.fn(),
  mockVerifyMfaToken: vi.fn(),
}));

vi.mock("../../src/token/services/withdrawal.service", () => ({
  withdrawFiat: mockWithdrawFiat,
  withdrawMpt: mockWithdrawMpt,
}));

// requireOperationMfa calls verifyMfaToken; stub it so a present x-mfa-token passes.
vi.mock("../../src/token/services/mfa-token.service", () => ({
  verifyMfaToken: mockVerifyMfaToken,
  generateMfaToken: vi.fn(),
}));

// Full write auth: valid session (KYC approved + MFA second factor) + operation MFA token header.
const FULL_AUTH = { Authorization: "Bearer valid-session", "x-mfa-token": "valid-mfa-token" };

const VALID_BANK_ACCOUNT = {
  bankCode: "0001",
  branchCode: "001",
  accountNumber: "1234567",
  accountHolder: "Test User",
  label: "main",
};
const OVER_MAX = 9_007_199_254_740_992;
const VALID_XRPL_ADDRESS = "rN7n3473SaZBCG4dFL83w7p1W9cgPJTztk";

describe("Withdrawal Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
    mockWithdrawFiat.mockReset();
    mockWithdrawMpt.mockReset();
    mockVerifyMfaToken.mockReset();
  });

  describe("POST /api/v1/withdraw/fiat", () => {
    const VALID = { amount: 1000, bankAccount: VALID_BANK_ACCOUNT };

    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/withdraw/fiat", VALID);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when KYC is not approved", async () => {
      mockIdentityPlatformAuth.setupWithoutMfa();
      const response = await helper.post("/api/v1/withdraw/fiat", VALID, FULL_AUTH);
      restAssert.expectError(response, 403);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.post("/api/v1/withdraw/fiat", VALID, { Authorization: "Bearer valid-session" });
      restAssert.expectError(response, 403, "MFA verification required");
    });

    it("returns 400 for a zero amount", async () => {
      const response = await helper.post("/api/v1/withdraw/fiat", { ...VALID, amount: 0 }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for an amount above the safe ceiling", async () => {
      const response = await helper.post("/api/v1/withdraw/fiat", { ...VALID, amount: OVER_MAX }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockWithdrawFiat.mockResolvedValue({ amount: 1000, txReference: "ref-1" });

      const response = await helper.post("/api/v1/withdraw/fiat", VALID, FULL_AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockWithdrawFiat).toHaveBeenCalled();
      expect(mockWithdrawFiat.mock.calls[0]?.[0]).toBe("google-uid-123456");
      expect(mockWithdrawFiat.mock.calls[0]?.[1]).toBe(1000);
    });
  });

  describe("POST /api/v1/withdraw/mpt", () => {
    const VALID = { tokenId: "JPYN", tokenAmount: 1000, destinationAddress: VALID_XRPL_ADDRESS };

    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/withdraw/mpt", VALID);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.post("/api/v1/withdraw/mpt", VALID, { Authorization: "Bearer valid-session" });
      restAssert.expectError(response, 403, "MFA verification required");
    });

    it("returns 400 for an invalid destination address", async () => {
      const response = await helper.post(
        "/api/v1/withdraw/mpt",
        { ...VALID, destinationAddress: "not-an-address" },
        FULL_AUTH,
      );
      restAssert.expectError(response, 400);
    });

    it("returns 400 for an amount above the safe ceiling", async () => {
      const response = await helper.post("/api/v1/withdraw/mpt", { ...VALID, tokenAmount: OVER_MAX }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockWithdrawMpt.mockResolvedValue({ tokenId: "JPYN", amount: 1000, xrplTxHash: "hash-1" });

      const response = await helper.post("/api/v1/withdraw/mpt", VALID, FULL_AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockWithdrawMpt).toHaveBeenCalledWith("google-uid-123456", "JPYN", 1000, VALID_XRPL_ADDRESS);
    });
  });
});
