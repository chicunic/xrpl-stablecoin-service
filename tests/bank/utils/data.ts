export const TEST_BANK_ACCOUNT_ID = "test-bank-account-id";
export const TEST_BANK_ACCOUNT_NUMBER = "0000001";
export const TEST_BANK_BRANCH_CODE = "001";
export const TEST_BANK_PIN = "1234";
export const TEST_BANK_ACCOUNT_HOLDER = "テスト太郎";
export const MOCK_BANK_ACCOUNT = {
  accountId: TEST_BANK_ACCOUNT_ID,
  accountNumber: TEST_BANK_ACCOUNT_NUMBER,
  accountType: "personal" as const,
  accountHolder: TEST_BANK_ACCOUNT_HOLDER,
  bankCode: "9999",
  branchCode: TEST_BANK_BRANCH_CODE,
  balance: 0,
  transactionSequence: 0,
  pin: "1234",
  createdAt: "mock-timestamp",
  updatedAt: "mock-timestamp",
};

export const MOCK_BANK_ACCOUNT_SAFE = {
  accountId: TEST_BANK_ACCOUNT_ID,
  accountNumber: TEST_BANK_ACCOUNT_NUMBER,
  accountType: "personal" as const,
  accountHolder: TEST_BANK_ACCOUNT_HOLDER,
  bankCode: "9999",
  branchCode: TEST_BANK_BRANCH_CODE,
  balance: 0,
  transactionSequence: 0,
  createdAt: "mock-timestamp",
  updatedAt: "mock-timestamp",
};

export const TEST_CORPORATE_ACCOUNT_ID = "test-corporate-account-id";
export const TEST_CORPORATE_ACCOUNT_NUMBER = "0010000";
export const TEST_CORPORATE_BRANCH_CODE = "001";

export const MOCK_CORPORATE_ACCOUNT = {
  accountId: TEST_CORPORATE_ACCOUNT_ID,
  accountNumber: TEST_CORPORATE_ACCOUNT_NUMBER,
  accountType: "corporate" as const,
  accountHolder: "テスト法人",
  bankCode: "9999",
  branchCode: TEST_CORPORATE_BRANCH_CODE,
  balance: 0,
  transactionSequence: 0,
  pin: "1234",
  createdAt: "mock-timestamp",
  updatedAt: "mock-timestamp",
};

export const TEST_VIRTUAL_ACCOUNT_ID = "test-virtual-account-id";
export const TEST_VIRTUAL_ACCOUNT_NUMBER = "0010001";

export const MOCK_VIRTUAL_ACCOUNT = {
  virtualAccountId: TEST_VIRTUAL_ACCOUNT_ID,
  accountNumber: TEST_VIRTUAL_ACCOUNT_NUMBER,
  branchCode: TEST_CORPORATE_BRANCH_CODE,
  parentAccountId: TEST_CORPORATE_ACCOUNT_ID,
  parentAccountNumber: TEST_CORPORATE_ACCOUNT_NUMBER,
  label: "テスト用途",
  isActive: true,
  createdAt: "mock-timestamp",
  updatedAt: "mock-timestamp",
};

export const MOCK_BANK_TRANSACTION = {
  transactionId: "test-transaction-id",
  accountId: TEST_BANK_ACCOUNT_ID,
  type: "deposit" as const,
  amount: 10000,
  balance: 10000,
  counterparty: null,
  sequenceNumber: 1,
  description: "ATM入金",
  createdAt: "mock-timestamp",
};
