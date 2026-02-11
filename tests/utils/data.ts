export const TEST_USER_UID = "google-uid-123456";
export const TEST_USER_EMAIL = "test@example.com";
export const TEST_USER_NAME = "Test User";

export const TEST_TOKEN_ID = "JPYN";
export const TEST_WALLET_ADDRESS = "rN7n3473SaZBCG4dFL83w7p1W9cgPJTztk";

export const MOCK_USER_DOC_BASE = {
  uid: TEST_USER_UID,
  email: TEST_USER_EMAIL,
  name: TEST_USER_NAME,
  fiatBalance: 0,
  kycStatus: "none",
  createdAt: "mock-timestamp",
};

export const MOCK_KYC_DOC = {
  fullName: "山田 太郎",
  phoneNumber: "09012345678",
  postalCode: "1000001",
  prefecture: "東京都",
  city: "千代田区",
  town: "丸の内",
  address: "1-1-1",
  status: "approved",
  submittedAt: "mock-timestamp",
};

export const MOCK_WALLET_DOC = {
  address: "rMockAddress123",
  bipIndex: 1,
  createdAt: "mock-timestamp",
};

export const MOCK_VIRTUAL_ACCOUNT_DOC = {
  bankCode: "9999",
  branchCode: "001",
  accountNumber: "0010001",
  accountHolder: "Mock User",
  label: "",
  createdAt: "mock-timestamp",
};

export const MOCK_TOKEN_DOC = {
  tokenId: TEST_TOKEN_ID,
  name: "JPYN Stablecoin",
  currency: "JPYN",
  domain: "example.com",
  issuerAddress: "rIssuerAddress123",
  kmsKeyPath: "projects/test/locations/test/keyRings/test/cryptoKeys/test/cryptoKeyVersions/1",
  signingPublicKey: "0300000000000000000000000000000000000000000000000000000000000000FF",
  createdAt: "mock-timestamp",
};

export const MOCK_TOKEN_BALANCE_DOC = {
  currency: "JPYN",
  issuer: "rIssuerAddress123",
  balance: 50000,
  updatedAt: "mock-timestamp",
};

export const MOCK_XRP_TRANSACTION = {
  transactionId: "mock-xrp-tx-id",
  tokenId: TEST_TOKEN_ID,
  type: "deposit" as const,
  amount: 10000,
  balance: 10000,
  description: "JPYN 入金",
  relatedOrderId: "mock-xrpl-hash",
  txHash: "mock-xrpl-hash",
  createdAt: "mock-timestamp",
};
