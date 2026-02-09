import type express from "express";
import { ValidationError } from "../../../src/common/utils/error.handler";
import { restAssert } from "../../utils/helpers";
import { mockFirestoreService } from "../../utils/mock.index";
import { TEST_BANK_PIN } from "../utils/data";
import { mockBankAuth } from "../utils/mock.bank-auth";
import {
  enableAccountServiceMock,
  enableTransferServiceMock,
  mockAccountService,
  mockTransferService,
} from "../utils/mock.bank-services";
import { BankRestTestHelper, createBankTestApp } from "../utils/server.rest";

enableAccountServiceMock();
enableTransferServiceMock();

describe("Bank Transfer Routes - REST API Integration", () => {
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
    mockAccountService.reset();
    mockAccountService.setup();
    mockTransferService.reset();
    mockTransferService.setup();
  });

  describe("POST /api/v1/transfers", () => {
    it("should transfer funds", async () => {
      mockTransferService.transfer.mockResolvedValue({ balance: 5000, transactionId: "tx-123" });

      const response = await helper.post(
        "/api/v1/transfers",
        { toBranchCode: "001", toAccountNumber: "0000002", amount: 5000, pin: TEST_BANK_PIN },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response);
      expect(response.body.balance).toBe(5000);
      expect(response.body.transactionId).toBe("tx-123");
    });

    it("should return 401 without auth", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
      });

      const response = await helper.post("/api/v1/transfers", {
        toBranchCode: "001",
        toAccountNumber: "0000002",
        amount: 5000,
        pin: TEST_BANK_PIN,
      });

      restAssert.expectError(response, 401);
    });

    it("should return 400 for insufficient balance", async () => {
      mockTransferService.transfer.mockRejectedValue(new ValidationError("Invalid: insufficient balance"));

      const response = await helper.post(
        "/api/v1/transfers",
        { toBranchCode: "001", toAccountNumber: "0000002", amount: 100000, pin: TEST_BANK_PIN },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 400);
    });

    it("should return 404 for destination not found", async () => {
      mockTransferService.transfer.mockRejectedValue(new ValidationError("Invalid: destination account not found"));

      const response = await helper.post(
        "/api/v1/transfers",
        { toBranchCode: "001", toAccountNumber: "9999999", amount: 5000, pin: TEST_BANK_PIN },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 400);
    });
  });
});
