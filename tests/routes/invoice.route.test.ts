import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

const {
  mockSendInvoice,
  mockPayInvoice,
  mockListInvoices,
  mockGetInvoice,
  mockCancelInvoice,
  mockParseInvoicePdf,
  mockVerifyMfaToken,
} = vi.hoisted(() => ({
  mockSendInvoice: vi.fn(),
  mockPayInvoice: vi.fn(),
  mockListInvoices: vi.fn(),
  mockGetInvoice: vi.fn(),
  mockCancelInvoice: vi.fn(),
  mockParseInvoicePdf: vi.fn(),
  mockVerifyMfaToken: vi.fn(),
}));

vi.mock("../../src/token/services/invoice.service", () => ({
  sendInvoice: mockSendInvoice,
  payInvoice: mockPayInvoice,
  listInvoices: mockListInvoices,
  getInvoice: mockGetInvoice,
  cancelInvoice: mockCancelInvoice,
}));

vi.mock("../../src/token/services/invoice-pdf.service", () => ({
  parseInvoicePdf: mockParseInvoicePdf,
}));

vi.mock("../../src/token/services/mfa-token.service", () => ({
  verifyMfaToken: mockVerifyMfaToken,
  generateMfaToken: vi.fn(),
}));

const READ_AUTH = { Authorization: "Bearer valid-session" };
const FULL_AUTH = { Authorization: "Bearer valid-session", "x-mfa-token": "valid-mfa-token" };
const OVER_MAX = 9_007_199_254_740_992;
const VALID_XRPL_ADDRESS = "rN7n3473SaZBCG4dFL83w7p1W9cgPJTztk";

const VALID_INVOICE = {
  tokenId: "JPYN",
  amount: 1000,
  recipientAddress: VALID_XRPL_ADDRESS,
  recipientName: "田中太郎",
  description: "テスト請求",
};

describe("Invoice Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
    mockSendInvoice.mockReset();
    mockPayInvoice.mockReset();
    mockListInvoices.mockReset();
    mockGetInvoice.mockReset();
    mockCancelInvoice.mockReset();
    mockParseInvoicePdf.mockReset();
    mockVerifyMfaToken.mockReset();
  });

  describe("POST /api/v1/invoices/pay/parse-pdf", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/invoices/pay/parse-pdf", {});
      restAssert.expectError(response, 401);
    });

    it("returns 400 when no PDF file is provided", async () => {
      // multipart body without the pdf field; reaches the handler which rejects it.
      const res = await app.request("/api/v1/invoices/pay/parse-pdf", {
        method: "POST",
        headers: { Authorization: "Bearer valid-session" },
        body: new FormData(),
      });
      expect(res.status).toBe(400);
    });

    it("returns 200 and calls the parser for a valid PDF upload", async () => {
      mockParseInvoicePdf.mockResolvedValue({ tokenId: "JPYN", amount: 1000 });

      const form = new FormData();
      form.append("pdf", new File([Buffer.from("%PDF-1.4")], "invoice.pdf", { type: "application/pdf" }));

      const res = await app.request("/api/v1/invoices/pay/parse-pdf", {
        method: "POST",
        headers: { Authorization: "Bearer valid-session" },
        body: form,
      });

      expect(res.status).toBe(200);
      expect(mockParseInvoicePdf).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/invoices/send", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/invoices/send", VALID_INVOICE);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when KYC is not approved", async () => {
      mockIdentityPlatformAuth.setupWithoutMfa();
      const response = await helper.post("/api/v1/invoices/send", VALID_INVOICE, READ_AUTH);
      restAssert.expectError(response, 403, "KYC required");
    });

    it("returns 400 for a zero amount", async () => {
      const response = await helper.post("/api/v1/invoices/send", { ...VALID_INVOICE, amount: 0 }, READ_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 400 for an amount above the safe ceiling", async () => {
      const response = await helper.post("/api/v1/invoices/send", { ...VALID_INVOICE, amount: OVER_MAX }, READ_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockSendInvoice.mockResolvedValue({ invoiceId: "inv-1", status: "pending" });

      const response = await helper.post("/api/v1/invoices/send", VALID_INVOICE, READ_AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockSendInvoice).toHaveBeenCalledWith("google-uid-123456", expect.objectContaining({ tokenId: "JPYN" }));
    });
  });

  describe("POST /api/v1/invoices/pay", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/invoices/pay", VALID_INVOICE);
      restAssert.expectError(response, 401);
    });

    it("returns 403 when the operation MFA token header is missing", async () => {
      const response = await helper.post("/api/v1/invoices/pay", VALID_INVOICE, READ_AUTH);
      restAssert.expectError(response, 403);
    });

    it("returns 400 for a zero amount", async () => {
      const response = await helper.post("/api/v1/invoices/pay", { ...VALID_INVOICE, amount: 0 }, FULL_AUTH);
      restAssert.expectError(response, 400);
    });

    it("returns 201 and calls the service on a valid request", async () => {
      mockPayInvoice.mockResolvedValue({ paymentId: "pay-1", status: "paid" });

      const response = await helper.post("/api/v1/invoices/pay", VALID_INVOICE, FULL_AUTH);

      restAssert.expectSuccess(response, 201);
      expect(mockPayInvoice).toHaveBeenCalledWith("google-uid-123456", expect.objectContaining({ tokenId: "JPYN" }));
    });
  });

  describe("GET /api/v1/invoices", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/invoices");
      restAssert.expectError(response, 401);
    });

    it("returns 200 and passes the type filter to the service", async () => {
      mockListInvoices.mockResolvedValue([{ invoiceId: "inv-1" }]);

      const response = await helper.get("/api/v1/invoices?type=send", READ_AUTH);

      restAssert.expectSuccess(response, 200);
      expect(mockListInvoices).toHaveBeenCalledWith("google-uid-123456", "send");
    });

    it("returns 400 for an invalid type filter", async () => {
      const response = await helper.get("/api/v1/invoices?type=bogus", READ_AUTH);
      restAssert.expectError(response, 400);
    });
  });

  describe("GET /api/v1/invoices/{invoiceId}", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.get("/api/v1/invoices/inv-1");
      restAssert.expectError(response, 401);
    });

    it("returns 200 and calls the service", async () => {
      mockGetInvoice.mockResolvedValue({ invoiceId: "inv-1" });

      const response = await helper.get("/api/v1/invoices/inv-1", READ_AUTH);

      restAssert.expectSuccess(response, 200);
      expect(mockGetInvoice).toHaveBeenCalledWith("google-uid-123456", "inv-1");
    });
  });

  describe("POST /api/v1/invoices/{invoiceId}/cancel", () => {
    it("returns 401 without auth header", async () => {
      const response = await helper.post("/api/v1/invoices/inv-1/cancel", {});
      restAssert.expectError(response, 401);
    });

    it("returns 200 and calls the service", async () => {
      mockCancelInvoice.mockResolvedValue({ invoiceId: "inv-1", status: "cancelled" });

      const response = await helper.post("/api/v1/invoices/inv-1/cancel", {}, READ_AUTH);

      restAssert.expectSuccess(response, 200);
      expect(mockCancelInvoice).toHaveBeenCalledWith("google-uid-123456", "inv-1");
    });
  });
});
