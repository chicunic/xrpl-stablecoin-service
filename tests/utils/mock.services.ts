export const mockXrplService = {
  sendToken: vi.fn(),
  sendTokenFromUser: vi.fn(),
  sendXrpFromUser: vi.fn(),
  getBalances: vi.fn(),
  getClient: vi.fn(),
  disconnect: vi.fn(),
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
  signWithKms: vi.fn(),
  getPublicKey: vi.fn(),
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
  deriveWallet: vi.fn(),
  getWalletForSigning: vi.fn(),
  allocateXrpAddressIndex: vi.fn(),
  setup: () => {
    mockWalletService.deriveWallet.mockResolvedValue({ address: "rMockAddress123", publicKey: "mock-pub-key" });
    mockWalletService.getWalletForSigning.mockResolvedValue({
      sign: vi.fn().mockReturnValue({ tx_blob: "mock-blob", hash: "mock-hash" }),
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
  fundAccount: vi.fn(),
  setup: () => {
    mockFaucetService.fundAccount.mockResolvedValue({ balance: 1000 });
  },
  reset: () => {
    mockFaucetService.fundAccount.mockReset();
  },
};

export const mockTrustlineService = {
  hasTrustLine: vi.fn(),
  setTrustLine: vi.fn(),
  ensureTrustLine: vi.fn(),
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
