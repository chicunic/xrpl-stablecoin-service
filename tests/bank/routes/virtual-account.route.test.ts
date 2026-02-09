import type express from "express";
import { restAssert } from "../../utils/helpers";
import { mockFirestoreService } from "../../utils/mock.index";
import {
  MOCK_BANK_ACCOUNT,
  MOCK_CORPORATE_ACCOUNT,
  MOCK_VIRTUAL_ACCOUNT,
  TEST_CORPORATE_ACCOUNT_ID,
  TEST_VIRTUAL_ACCOUNT_ID,
} from "../utils/data";
import { mockBankAuth } from "../utils/mock.bank-auth";
import {
  enableAccountServiceMock,
  enableVirtualAccountServiceMock,
  mockAccountService,
  mockVirtualAccountService,
} from "../utils/mock.bank-services";
import { BankRestTestHelper, createBankTestApp } from "../utils/server.rest";

enableAccountServiceMock();
enableVirtualAccountServiceMock();

describe("Bank Virtual Account Routes - REST API Integration", () => {
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
    mockVirtualAccountService.reset();
    mockVirtualAccountService.setup();
  });

  describe("POST /api/v1/accounts/me/virtual-accounts", () => {
    it("should create a virtual account for corporate account", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.createVirtualAccount.mockResolvedValue(MOCK_VIRTUAL_ACCOUNT);

      const response = await helper.post(
        "/api/v1/accounts/me/virtual-accounts",
        { label: "テスト用途" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response, 201);
      expect(response.body.virtualAccountId).toBe(TEST_VIRTUAL_ACCOUNT_ID);
      expect(response.body.accountNumber).toBe("0010001");
      expect(mockVirtualAccountService.createVirtualAccount).toHaveBeenCalledWith(
        TEST_CORPORATE_ACCOUNT_ID,
        "テスト用途",
      );
    });

    it("should return 403 for personal account", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_BANK_ACCOUNT);

      const response = await helper.post(
        "/api/v1/accounts/me/virtual-accounts",
        { label: "テスト用途" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 403);
    });

    it("should return 401 without auth", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
      });

      const response = await helper.post("/api/v1/accounts/me/virtual-accounts", {
        label: "テスト用途",
      });

      restAssert.expectError(response, 401);
    });
  });

  describe("GET /api/v1/accounts/me/virtual-accounts", () => {
    it("should list virtual accounts for corporate account", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.listVirtualAccounts.mockResolvedValue([MOCK_VIRTUAL_ACCOUNT]);

      const response = await helper.get("/api/v1/accounts/me/virtual-accounts", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectSuccess(response);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].virtualAccountId).toBe(TEST_VIRTUAL_ACCOUNT_ID);
    });

    it("should return 403 for personal account", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_BANK_ACCOUNT);

      const response = await helper.get("/api/v1/accounts/me/virtual-accounts", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectError(response, 403);
    });
  });

  describe("GET /api/v1/accounts/me/virtual-accounts/:virtualAccountId", () => {
    it("should get virtual account details", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.getVirtualAccountById.mockResolvedValue(MOCK_VIRTUAL_ACCOUNT);

      const response = await helper.get(`/api/v1/accounts/me/virtual-accounts/${TEST_VIRTUAL_ACCOUNT_ID}`, {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectSuccess(response);
      expect(response.body.virtualAccountId).toBe(TEST_VIRTUAL_ACCOUNT_ID);
    });

    it("should return 404 for non-existent virtual account", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.getVirtualAccountById.mockResolvedValue(null);

      const response = await helper.get("/api/v1/accounts/me/virtual-accounts/non-existent-id", {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectError(response, 404);
    });

    it("should return 404 for virtual account owned by another corporate", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.getVirtualAccountById.mockResolvedValue({
        ...MOCK_VIRTUAL_ACCOUNT,
        parentAccountId: "other-corporate-id",
      });

      const response = await helper.get(`/api/v1/accounts/me/virtual-accounts/${TEST_VIRTUAL_ACCOUNT_ID}`, {
        Authorization: "Bearer mock-token",
      });

      restAssert.expectError(response, 404);
    });
  });

  describe("PATCH /api/v1/accounts/me/virtual-accounts/:virtualAccountId", () => {
    it("should update virtual account label", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.getVirtualAccountById.mockResolvedValue(MOCK_VIRTUAL_ACCOUNT);
      mockVirtualAccountService.updateVirtualAccount.mockResolvedValue({
        ...MOCK_VIRTUAL_ACCOUNT,
        label: "新しいラベル",
      });

      const response = await helper.patch(
        `/api/v1/accounts/me/virtual-accounts/${TEST_VIRTUAL_ACCOUNT_ID}`,
        { label: "新しいラベル" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response);
      expect(response.body.label).toBe("新しいラベル");
      expect(mockVirtualAccountService.updateVirtualAccount).toHaveBeenCalledWith(TEST_VIRTUAL_ACCOUNT_ID, {
        label: "新しいラベル",
        isActive: undefined,
      });
    });

    it("should deactivate virtual account", async () => {
      mockBankAuth.requireBankAuth.mockImplementation((req: any, _res: any, next: any) => {
        req.bankUser = { accountId: TEST_CORPORATE_ACCOUNT_ID };
        next();
      });
      mockAccountService.getAccountById.mockResolvedValue(MOCK_CORPORATE_ACCOUNT);
      mockVirtualAccountService.getVirtualAccountById.mockResolvedValue(MOCK_VIRTUAL_ACCOUNT);
      mockVirtualAccountService.updateVirtualAccount.mockResolvedValue({
        ...MOCK_VIRTUAL_ACCOUNT,
        isActive: false,
      });

      const response = await helper.patch(
        `/api/v1/accounts/me/virtual-accounts/${TEST_VIRTUAL_ACCOUNT_ID}`,
        { isActive: false },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectSuccess(response);
      expect(response.body.isActive).toBe(false);
    });

    it("should return 403 for personal account", async () => {
      mockAccountService.getAccountById.mockResolvedValue(MOCK_BANK_ACCOUNT);

      const response = await helper.patch(
        `/api/v1/accounts/me/virtual-accounts/${TEST_VIRTUAL_ACCOUNT_ID}`,
        { label: "新しいラベル" },
        { Authorization: "Bearer mock-token" },
      );

      restAssert.expectError(response, 403);
    });
  });
});
