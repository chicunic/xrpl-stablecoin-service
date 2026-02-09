import type express from "express";
import { restAssert } from "../../utils/helpers";
import { mockFirestoreService } from "../../utils/mock.index";
import { MOCK_BANK_TRANSACTION } from "../utils/data";
import { mockBankAuth } from "../utils/mock.bank-auth";
import { enableTransactionServiceMock, mockTransactionService } from "../utils/mock.bank-services";
import { BankRestTestHelper, createBankTestApp } from "../utils/server.rest";

enableTransactionServiceMock();

describe("Bank Transaction Routes - REST API Integration", () => {
  let app: express.Application;
  let helper: BankRestTestHelper;

  beforeAll(async () => {
    app = await createBankTestApp();
    helper = new BankRestTestHelper(app);
  });

  beforeEach(() => {
    mockFirestoreService.reset();
    mockFirestoreService.setup();
    mockBankAuth.reset();
    mockBankAuth.setup();
    mockTransactionService.reset();
    mockTransactionService.setup();
  });

  describe("GET /api/v1/transactions", () => {
    it("should return transaction list", async () => {
      mockTransactionService.getTransactionsByAccount.mockResolvedValue([MOCK_BANK_TRANSACTION]);

      const response = await helper.get("/api/v1/transactions", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectSuccess(response);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].transactionId).toBe(MOCK_BANK_TRANSACTION.transactionId);
    });

    it("should return empty array when no transactions", async () => {
      mockTransactionService.getTransactionsByAccount.mockResolvedValue([]);

      const response = await helper.get("/api/v1/transactions", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectSuccess(response);
      expect(response.body).toEqual([]);
    });

    it("should return 401 without auth", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
      });

      const response = await helper.get("/api/v1/transactions");

      restAssert.expectError(response, 401);
    });
  });
});
