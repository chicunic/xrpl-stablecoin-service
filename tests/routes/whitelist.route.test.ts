import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

const {
  mockAddXrplWhitelist,
  mockRemoveXrplWhitelist,
  mockGetXrplWhitelist,
  mockAddBankWhitelist,
  mockRemoveBankWhitelist,
  mockGetBankWhitelist,
  mockVerifyMfaToken,
} = vi.hoisted(() => ({
  mockAddXrplWhitelist: vi.fn(),
  mockRemoveXrplWhitelist: vi.fn(),
  mockGetXrplWhitelist: vi.fn(),
  mockAddBankWhitelist: vi.fn(),
  mockRemoveBankWhitelist: vi.fn(),
  mockGetBankWhitelist: vi.fn(),
  mockVerifyMfaToken: vi.fn(),
}));

vi.mock("../../src/token/services/whitelist.service", () => ({
  addXrplWhitelist: mockAddXrplWhitelist,
  removeXrplWhitelist: mockRemoveXrplWhitelist,
  getXrplWhitelist: mockGetXrplWhitelist,
  addBankWhitelist: mockAddBankWhitelist,
  removeBankWhitelist: mockRemoveBankWhitelist,
  getBankWhitelist: mockGetBankWhitelist,
}));

vi.mock("../../src/token/services/mfa-token.service", () => ({
  verifyMfaToken: mockVerifyMfaToken,
  generateMfaToken: vi.fn(),
}));

const READ_AUTH = { Authorization: "Bearer valid-session" };
const FULL_AUTH = { Authorization: "Bearer valid-session", "x-mfa-token": "valid-mfa-token" };
const VALID_XRPL_ADDRESS = "rN7n3473SaZBCG4dFL83w7p1W9cgPJTztk";

describe("Whitelist Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
    mockAddXrplWhitelist.mockReset();
    mockRemoveXrplWhitelist.mockReset();
    mockGetXrplWhitelist.mockReset();
    mockAddBankWhitelist.mockReset();
    mockRemoveBankWhitelist.mockReset();
    mockGetBankWhitelist.mockReset();
    mockVerifyMfaToken.mockReset();
  });

  describe("GET /api/v1/whitelist/xrpl", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/whitelist/xrpl");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the xrpl whitelist (read-only, no MFA needed)", async () => {
      mockGetXrplWhitelist.mockResolvedValue([{ address: VALID_XRPL_ADDRESS, label: "main" }]);

      const response = await helper.get("/api/v1/whitelist/xrpl", READ_AUTH);

      restAssert.expectSuccess(response, 200);
      expect(response.body).toHaveLength(1);
      expect(mockGetXrplWhitelist).toHaveBeenCalledWith("google-uid-123456");
    });
  });

  describe("POST /api/v1/whitelist/xrpl", () => {
    const VALID = { address: VALID_XRPL_ADDRESS, label: "main" };

    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/whitelist/xrpl", VALID);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.post("/api/v1/whitelist/xrpl", VALID, READ_AUTH);
      restAssert.expectError(response, 403);
    });

    it("returns 400 for an invalid address", async () => {
      const response = await helper.post("/api/v1/whitelist/xrpl", { address: "nope", label: "main" }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for an empty label", async () => {
      const response = await helper.post(
        "/api/v1/whitelist/xrpl",
        { address: VALID_XRPL_ADDRESS, label: "" },
        FULL_AUTH,
      );
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockAddXrplWhitelist.mockResolvedValue({ address: VALID_XRPL_ADDRESS, label: "main" });

      const response = await helper.post("/api/v1/whitelist/xrpl", VALID, FULL_AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockAddXrplWhitelist).toHaveBeenCalledWith("google-uid-123456", VALID_XRPL_ADDRESS, "main");
    });
  });

  describe("DELETE /api/v1/whitelist/xrpl/{address}", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.delete(`/api/v1/whitelist/xrpl/${VALID_XRPL_ADDRESS}`);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.delete(`/api/v1/whitelist/xrpl/${VALID_XRPL_ADDRESS}`, READ_AUTH);
      restAssert.expectError(response, 403);
    });

    it("returns 200 and calls the service on a valid request", async () => {
      mockRemoveXrplWhitelist.mockResolvedValue(undefined);

      const response = await helper.delete(`/api/v1/whitelist/xrpl/${VALID_XRPL_ADDRESS}`, FULL_AUTH);

      restAssert.expectSuccess(response, 200);
      expect((response.body as { status: string }).status).toBe("ok");
      expect(mockRemoveXrplWhitelist).toHaveBeenCalledWith("google-uid-123456", VALID_XRPL_ADDRESS);
    });
  });

  describe("GET /api/v1/whitelist/bank", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/whitelist/bank");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the bank whitelist", async () => {
      mockGetBankWhitelist.mockResolvedValue([]);

      const response = await helper.get("/api/v1/whitelist/bank", READ_AUTH);

      restAssert.expectSuccess(response, 200);
      expect(mockGetBankWhitelist).toHaveBeenCalledWith("google-uid-123456");
    });
  });

  describe("POST /api/v1/whitelist/bank", () => {
    const VALID = {
      bankCode: "0001",
      branchCode: "001",
      accountNumber: "1234567",
      accountHolder: "Test User",
      label: "main",
    };

    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/whitelist/bank", VALID);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.post("/api/v1/whitelist/bank", VALID, READ_AUTH);
      restAssert.expectError(response, 403);
    });

    it("returns 400 for a malformed bankCode", async () => {
      const response = await helper.post("/api/v1/whitelist/bank", { ...VALID, bankCode: "1" }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for a malformed accountNumber", async () => {
      const response = await helper.post("/api/v1/whitelist/bank", { ...VALID, accountNumber: "12" }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockAddBankWhitelist.mockResolvedValue({ ...VALID });

      const response = await helper.post("/api/v1/whitelist/bank", VALID, FULL_AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockAddBankWhitelist).toHaveBeenCalled();
      expect(mockAddBankWhitelist.mock.calls[0]?.[0]).toBe("google-uid-123456");
    });
  });

  describe("DELETE /api/v1/whitelist/bank/{id}", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.delete("/api/v1/whitelist/bank/001-1234567");
      restAssert.expectError(response, 401);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.delete("/api/v1/whitelist/bank/001-1234567", READ_AUTH);
      restAssert.expectError(response, 403);
    });

    it("returns 400 for an id not in branchCode-accountNumber format", async () => {
      const response = await helper.delete("/api/v1/whitelist/bank/badid", FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 200 and calls the service on a valid request", async () => {
      mockRemoveBankWhitelist.mockResolvedValue(undefined);

      const response = await helper.delete("/api/v1/whitelist/bank/001-1234567", FULL_AUTH);

      restAssert.expectSuccess(response, 200);
      expect(mockRemoveBankWhitelist).toHaveBeenCalledWith("google-uid-123456", "001", "1234567");
    });
  });
});
