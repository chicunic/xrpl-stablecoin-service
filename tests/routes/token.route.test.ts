import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

const {
  mockGetUserWallet,
  mockHolderHasAcceptedCredential,
  mockHasMptAuthorization,
  mockAuthorize,
  mockIssuerAuthorize,
  mockCreateAuthorizationDoc,
} = vi.hoisted(() => ({
  mockGetUserWallet: vi.fn(),
  mockHolderHasAcceptedCredential: vi.fn(),
  mockHasMptAuthorization: vi.fn(),
  mockAuthorize: vi.fn(),
  mockIssuerAuthorize: vi.fn(),
  mockCreateAuthorizationDoc: vi.fn(),
}));

vi.mock("../../src/token/services/auth.service", () => ({
  getUserWallet: mockGetUserWallet,
}));

vi.mock("../../src/token/services/credential.service", () => ({
  holderHasAcceptedCredential: mockHolderHasAcceptedCredential,
}));

vi.mock("../../src/token/services/xrpl.service", () => ({
  hasMptAuthorization: mockHasMptAuthorization,
  authorize: mockAuthorize,
  issuerAuthorize: mockIssuerAuthorize,
}));

vi.mock("../../src/token/services/token-balance.service", () => ({
  createAuthorizationDoc: mockCreateAuthorizationDoc,
}));

const AUTH = { Authorization: "Bearer valid-session" };

describe("Token Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
    mockGetUserWallet.mockReset();
    mockHolderHasAcceptedCredential.mockReset();
    mockHasMptAuthorization.mockReset();
    mockAuthorize.mockReset();
    mockIssuerAuthorize.mockReset();
    mockCreateAuthorizationDoc.mockReset();
  });

  describe("GET /api/v1/tokens", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/tokens");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the public token list", async () => {
      const response = await helper.get("/api/v1/tokens", AUTH);

      restAssert.expectSuccess(response, 200);
      const tokens = response.body as Record<string, unknown>[];
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
      // Public projection must not leak signing fields.
      const first = tokens[0];
      expect(first).not.toHaveProperty("kmsKeyPath");
      expect(first).not.toHaveProperty("signingPublicKey");
    });
  });

  describe("GET /api/v1/tokens/{tokenId}", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/tokens/JPYN");
      restAssert.expectError(response, 401);
    });

    it("returns 200 with the requested token config", async () => {
      const response = await helper.get("/api/v1/tokens/JPYN", AUTH);

      restAssert.expectSuccess(response, 200);
      expect((response.body as { tokenId: string }).tokenId).toBe("JPYN");
    });
  });

  describe("POST /api/v1/tokens/{tokenId}/authorize", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/tokens/JPYN/authorize", {});
      restAssert.expectError(response, 401);
    });

    it("returns 400 when the wallet is not set up", async () => {
      mockGetUserWallet.mockResolvedValue(null);

      const response = await helper.post("/api/v1/tokens/JPYN/authorize", {}, AUTH);

      restAssert.expectError(response, 400, "Wallet not set up");
    });

    it("returns 403 when the holder lacks the KYC credential", async () => {
      mockGetUserWallet.mockResolvedValue({ address: "rMockAddress123", bipIndex: 1 });
      mockHolderHasAcceptedCredential.mockResolvedValue(false);

      const response = await helper.post("/api/v1/tokens/JPYN/authorize", {}, AUTH);

      restAssert.expectError(response, 403, "KYC credential required");
    });

    it("returns 200 and runs the authorization flow on success", async () => {
      mockGetUserWallet.mockResolvedValue({ address: "rMockAddress123", bipIndex: 1 });
      mockHolderHasAcceptedCredential.mockResolvedValue(true);
      mockHasMptAuthorization.mockResolvedValue(false);
      mockAuthorize.mockResolvedValue("tx-hash");
      mockIssuerAuthorize.mockResolvedValue("tx-hash");
      mockCreateAuthorizationDoc.mockResolvedValue(undefined);

      const response = await helper.post("/api/v1/tokens/JPYN/authorize", {}, AUTH);

      restAssert.expectSuccess(response, 200);
      expect((response.body as { status: string }).status).toBe("ok");
      expect(mockIssuerAuthorize).toHaveBeenCalled();
      expect(mockCreateAuthorizationDoc).toHaveBeenCalled();
    });
  });
});
