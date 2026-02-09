import { createJestMock, createSimpleModuleMock } from "./mock.factory";

export const mockXrplService = {
  sendToken: createJestMock(),
  sendTokenFromUser: createJestMock(),
  sendXrpFromUser: createJestMock(),
  getBalances: createJestMock(),
  getClient: createJestMock(),
  disconnect: createJestMock(),
  setup: () => {
    mockXrplService.sendToken.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.sendTokenFromUser.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.sendXrpFromUser.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.getBalances.mockResolvedValue([]);
    mockXrplService.getClient.mockResolvedValue({});
    mockXrplService.disconnect.mockResolvedValue(undefined);
  },
  reset: () => {
    mockXrplService.sendToken.mockReset();
    mockXrplService.sendTokenFromUser.mockReset();
    mockXrplService.sendXrpFromUser.mockReset();
    mockXrplService.getBalances.mockReset();
    mockXrplService.getClient.mockReset();
    mockXrplService.disconnect.mockReset();
  },
};

export const mockKmsService = {
  signWithKms: createJestMock(),
  getPublicKey: createJestMock(),
  setup: () => {
    mockKmsService.signWithKms.mockResolvedValue("mock-signature");
    mockKmsService.getPublicKey.mockResolvedValue("mock-public-key");
  },
  reset: () => {
    mockKmsService.signWithKms.mockReset();
    mockKmsService.getPublicKey.mockReset();
  },
};

export const mockWalletService = {
  deriveWallet: createJestMock(),
  getWalletForSigning: createJestMock(),
  allocateXrpAddressIndex: createJestMock(),
  setup: () => {
    mockWalletService.deriveWallet.mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" });
    mockWalletService.getWalletForSigning.mockResolvedValue({
      sign: jest.fn().mockReturnValue({ tx_blob: "mock-blob", hash: "mock-hash" }),
    });
    mockWalletService.allocateXrpAddressIndex.mockResolvedValue(1);
  },
  reset: () => {
    mockWalletService.deriveWallet.mockReset();
    mockWalletService.getWalletForSigning.mockReset();
    mockWalletService.allocateXrpAddressIndex.mockReset();
  },
};

export const mockFaucetService = {
  fundAccount: createJestMock(),
  setup: () => {
    mockFaucetService.fundAccount.mockResolvedValue({ balance: 1000 });
  },
  reset: () => {
    mockFaucetService.fundAccount.mockReset();
  },
};

export const mockTrustlineService = {
  hasTrustLine: createJestMock(),
  setTrustLine: createJestMock(),
  ensureTrustLine: createJestMock(),
  setup: () => {
    mockTrustlineService.hasTrustLine.mockResolvedValue(false);
    mockTrustlineService.setTrustLine.mockResolvedValue("mock-trustline-tx-hash");
    mockTrustlineService.ensureTrustLine.mockResolvedValue(undefined);
  },
  reset: () => {
    mockTrustlineService.hasTrustLine.mockReset();
    mockTrustlineService.setTrustLine.mockReset();
    mockTrustlineService.ensureTrustLine.mockReset();
  },
};

export function enableXrplServiceMock() {
  createSimpleModuleMock("../../src/token/services/xrpl.service", {
    sendToken: mockXrplService.sendToken,
    sendTokenFromUser: mockXrplService.sendTokenFromUser,
    sendXrpFromUser: mockXrplService.sendXrpFromUser,
    getBalances: mockXrplService.getBalances,
    getClient: mockXrplService.getClient,
    disconnect: mockXrplService.disconnect,
  });
}

export function enableFaucetServiceMock() {
  createSimpleModuleMock("../../src/token/services/faucet.service", {
    fundAccount: mockFaucetService.fundAccount,
  });
}

export function enableTrustlineServiceMock() {
  createSimpleModuleMock("../../src/token/services/trustline.service", {
    hasTrustLine: mockTrustlineService.hasTrustLine,
    setTrustLine: mockTrustlineService.setTrustLine,
    ensureTrustLine: mockTrustlineService.ensureTrustLine,
  });
}

export function enableWalletServiceMock() {
  createSimpleModuleMock("../../src/token/services/wallet.service", {
    deriveWallet: mockWalletService.deriveWallet,
    getWalletForSigning: mockWalletService.getWalletForSigning,
    allocateXrpAddressIndex: mockWalletService.allocateXrpAddressIndex,
  });
}

export function enableKmsServiceMock() {
  createSimpleModuleMock("../../src/token/services/kms.service", {
    signWithKms: mockKmsService.signWithKms,
    getPublicKey: mockKmsService.getPublicKey,
  });
}

export function enableBankConfigMock() {
  createSimpleModuleMock("../../src/token/config/bank", {
    getBankServiceUrl: jest.fn().mockReturnValue("http://mock-bank-service"),
    getBankAuthToken: jest.fn().mockResolvedValue("mock-bank-auth-token"),
  });
}
