import type express from "express";
import { ValidationError } from "../../../src/common/utils/error.handler";
import { restAssert } from "../../utils/helpers";
import { mockFirestoreService } from "../../utils/mock.index";
import {
  MOCK_BANK_ACCOUNT,
  MOCK_BANK_ACCOUNT_SAFE,
  MOCK_CORPORATE_ACCOUNT,
  TEST_BANK_ACCOUNT_HOLDER,
  TEST_BANK_ACCOUNT_NUMBER,
  TEST_BANK_BRANCH_CODE,
  TEST_BANK_PIN,
} from "../utils/data";
import { mockBankAuth } from "../utils/mock.bank-auth";
import { enableAccountServiceMock, mockAccountService } from "../utils/mock.bank-services";
import { BankRestTestHelper, createBankTestApp } from "../utils/server.rest";

enableAccountServiceMock();

describe("Bank Account Routes - REST API Integration", () => {
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
  });

  describe("POST /api/v1/accounts", () => {
    it("should create a new bank account", async () => {
      mockAccountService.createAccount.mockResolvedValue(MOCK_BANK_ACCOUNT_SAFE);

      const response = await helper.post("/api/v1/accounts", {
        pin: TEST_BANK_PIN,
        accountHolder: TEST_BANK_ACCOUNT_HOLDER,
      });

      restAssert.expectSuccess(response, 201);
      expect(response.body.accountId).toBe(MOCK_BANK_ACCOUNT_SAFE.accountId);
      expect(response.body.accountNumber).toBe(MOCK_BANK_ACCOUNT_SAFE.accountNumber);
      expect(response.body.pin).toBeUndefined();
    });

    it("should return 400 for missing fields", async () => {
      const response = await helper.post("/api/v1/accounts", {});

      restAssert.expectError(response, 400);
    });
  });

  describe("POST /api/v1/accounts/login", () => {
    it("should login with valid credentials", async () => {
      mockAccountService.login.mockResolvedValue(MOCK_BANK_ACCOUNT);
      mockBankAuth.generateToken.mockResolvedValue("mock-jwt-token");

      const response = await helper.post("/api/v1/accounts/login", {
        branchCode: TEST_BANK_BRANCH_CODE,
        accountNumber: TEST_BANK_ACCOUNT_NUMBER,
        pin: TEST_BANK_PIN,
      });

      restAssert.expectSuccess(response);
      expect(response.body.token).toBe("mock-jwt-token");
      expect(response.body.account).toBeDefined();
      expect(response.body.account.pin).toBeUndefined();
    });

    it("should return 400 for invalid credentials", async () => {
      mockAccountService.login.mockRejectedValue(new ValidationError("Invalid credentials"));

      const response = await helper.post("/api/v1/accounts/login", {
        branchCode: TEST_BANK_BRANCH_CODE,
        accountNumber: TEST_BANK_ACCOUNT_NUMBER,
        pin: "9999",
      });

      restAssert.expectError(response, 400);
    });
  });

  describe("GET /api/v1/accounts/lookup", () => {
    it("should return account info for valid lookup", async () => {
      const lookupResult = {
        accountHolder: TEST_BANK_ACCOUNT_HOLDER,
        bankCode: "9999",
        branchCode: TEST_BANK_BRANCH_CODE,
        accountNumber: TEST_BANK_ACCOUNT_NUMBER,
      };
      mockAccountService.lookupAccount.mockResolvedValue(lookupResult);

      const response = await helper.get(
        `/api/v1/accounts/lookup?branchCode=${TEST_BANK_BRANCH_CODE}&accountNumber=${TEST_BANK_ACCOUNT_NUMBER}`,
      );

      restAssert.expectSuccess(response);
      expect(response.body.accountHolder).toBe(TEST_BANK_ACCOUNT_HOLDER);
      expect(response.body.bankCode).toBe("9999");
    });

    it("should return 404 for non-existent account", async () => {
      mockAccountService.lookupAccount.mockResolvedValue(null);

      const response = await helper.get(`/api/v1/accounts/lookup?branchCode=999&accountNumber=9999999`);

      restAssert.expectError(response, 404);
    });

    it("should return 400 for missing query params", async () => {
      const response = await helper.get("/api/v1/accounts/lookup");

      restAssert.expectError(response, 400);
    });
  });

  describe("GET /api/v1/accounts/me", () => {
    it("should return 401 without auth header", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
      });

      const response = await helper.get("/api/v1/accounts/me");

      restAssert.expectError(response, 401);
    });

    it("should return current account info", async () => {
      const { pin: _, ...safeAccount } = MOCK_BANK_ACCOUNT;
      mockAccountService.getAccountById.mockResolvedValue(MOCK_BANK_ACCOUNT);

      const response = await helper.get("/api/v1/accounts/me", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectSuccess(response);
      expect(response.body.accountId).toBe(safeAccount.accountId);
      expect(response.body.pin).toBeUndefined();
    });

    it("should return 404 if account not found", async () => {
      mockAccountService.getAccountById.mockResolvedValue(null);

      const response = await helper.get("/api/v1/accounts/me", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectError(response, 404);
    });
  });

  describe("POST /api/v1/accounts/me/api-token", () => {
    it("should generate API token for corporate account", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockBankAuth.generateApiToken.mockResolvedValue("mock-api-token");

      const response = await helper.post("/api/v1/accounts/me/api-token", {}, { Authorization: "Bearer mock-token" });

      restAssert.expectSuccess(response);
      expect(response.body.token).toBe("mock-api-token");
    });

    it("should return 403 for personal account", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_BANK_ACCOUNT);

      const response = await helper.post("/api/v1/accounts/me/api-token", {}, { Authorization: "Bearer mock-token" });

      restAssert.expectError(response, 403);
    });

    it("should return 404 if account not found", async () => {
      mockAccountService.getAccountById.mockResolvedValue(null);

      const response = await helper.post("/api/v1/accounts/me/api-token", {}, { Authorization: "Bearer mock-token" });

      restAssert.expectError(response, 404);
    });

    it("should return 401 without auth", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
      });

      const response = await helper.post("/api/v1/accounts/me/api-token", {});

      restAssert.expectError(response, 401);
    });
  });

  describe("PATCH /api/v1/accounts/me", () => {
    it("should update accountHolder", async () => {
      const updatedAccount = { ...MOCK_BANK_ACCOUNT_SAFE, accountHolder: "新しい名前" };
      mockAccountService.updateAccount.mockResolvedValue(updatedAccount);

      const response = await helper.patch(
        "/api/v1/accounts/me",
        { accountHolder: "新しい名前" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response);
      expect(response.body.accountHolder).toBe("新しい名前");
    });

    it("should change PIN with valid oldPin", async () => {
      mockAccountService.changePin.mockResolvedValue(undefined);

      const response = await helper.patch(
        "/api/v1/accounts/me",
        { pin: "5678", oldPin: "1234" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response);
      expect(response.body.message).toBe("PIN updated successfully");
    });

    it("should return 400 when changing PIN without oldPin", async () => {
      const response = await helper.patch(
        "/api/v1/accounts/me",
        { pin: "5678" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 400);
    });

    it("should return 400 when incorrect oldPin", async () => {
      mockAccountService.changePin.mockRejectedValue(new ValidationError("Invalid: incorrect PIN"));

      const response = await helper.patch(
        "/api/v1/accounts/me",
        { pin: "5678", oldPin: "9999" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 400);
    });

    it("should enable pubsubEnabled for corporate account", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      const updatedAccount = { ...MOCK_CORPORATE_ACCOUNT, pubsubEnabled: true };
      const { pin: _, ...safe } = updatedAccount;
      mockAccountService.updateAccount.mockResolvedValue(safe);

      const response = await helper.patch(
        "/api/v1/accounts/me",
        { pubsubEnabled: true },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response);
      expect(response.body.pubsubEnabled).toBe(true);
    });

    it("should return 403 when personal account sets pubsubEnabled", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_BANK_ACCOUNT);

      const response = await helper.patch(
        "/api/v1/accounts/me",
        { pubsubEnabled: true },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 403);
    });

    it("should return 400 when no update fields provided", async () => {
      const response = await helper.patch("/api/v1/accounts/me", {}, { Authorization: "Bearer mock-token" });

      restAssert.expectError(response, 400);
    });

    it("should return 401 without auth", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
      });

      const response = await helper.patch("/api/v1/accounts/me", { accountHolder: "test" });

      restAssert.expectError(response, 401);
    });
  });
});
